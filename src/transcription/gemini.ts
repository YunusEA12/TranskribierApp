// Shared Gemini plumbing: client, Files API upload/delete, reading Interactions responses.
// Together with the engines, the only place in the app that talks to Gemini.

import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { boundedRequest } from '../lib/request';
import { HttpError, UserError, isNetworkError } from '../lib/errors';
import type { UploadedAudio } from '../jobs/queue';
import type { AudioInput } from './engine';

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey: apiKey.trim(), httpOptions: { timeout: CLIENT_TIMEOUT_MS } });
}

/** Re-throws SDK errors with a status as HttpError so the UI can map them. */
export async function geminiCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const status = (e as { status?: unknown } | null)?.status;
    if (typeof status === 'number') throw new HttpError('gemini', status, e instanceof Error ? e.message : String(e));
    throw e;
  }
}

// Gemini wants a bare MIME type and knows "audio/m4a" rather than the "audio/x-m4a" some systems report.
const MIME_ALIASES: Record<string, string> = { 'audio/x-m4a': 'audio/m4a', 'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav' };

export function geminiMimeType(mimeType: string): string {
  const base = mimeType.split(';')[0]!.trim().toLowerCase();
  return MIME_ALIASES[base] ?? base;
}

/** Recordings up to this size go inside the request (base64 adds a third; Gemini accepts 20 MB per request). */
export const INLINE_MAX_BYTES = 8 * 1024 * 1024;

const POLL_MS = 2000;
const MAX_PROCESSING_MS = 10 * 60 * 1000;
// Every request gets a time limit: on iOS a request can hang forever after the app was in the
// background, and a hanging request would block all following jobs.
const CLIENT_TIMEOUT_MS = 20 * 60 * 1000; // default for everything, long enough for big uploads


export async function uploadAudio(ai: GoogleGenAI, blob: Blob, mimeType: string, signal?: AbortSignal): Promise<UploadedAudio> {
  return boundedRequest((requestSignal) => geminiCall(async () => {
    // No httpOptions here: they would replace the SDK's own upload headers. The time limit is set on the client.
    let file = await ai.files.upload({ file: blob, config: { abortSignal: requestSignal, mimeType: geminiMimeType(mimeType), displayName: `mitschrift-${Date.now()}` } });
    const started = Date.now();
    while (file.state === 'PROCESSING') {
      if (Date.now() - started > MAX_PROCESSING_MS) throw new Error('Gemini verarbeitet die Datei zu lange.');
      await new Promise((r) => setTimeout(r, POLL_MS));
      requestSignal.throwIfAborted();
      file = await ai.files.get({ name: file.name!, config: { abortSignal: requestSignal } });
    }
    if (file.state === 'FAILED' || !file.name || !file.uri) throw new Error('Gemini konnte die Audiodatei nicht verarbeiten.');
    return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? geminiMimeType(mimeType), uploadedAt: Date.now() };
  }), CLIENT_TIMEOUT_MS, 'Das Hochladen dauert zu lange. Bitte erneut versuchen.', signal);
}

/** Best effort: Gemini deletes files after 48 hours anyway. */
export async function deleteUpload(ai: GoogleGenAI, name: string): Promise<void> {
  try {
    await boundedRequest(() => ai.files.delete({ name }), 10000, 'Datei konnte bei Google nicht gelöscht werden.');
  } catch {
    console.warn('Deleting uploaded file failed; Google will expire it automatically.');
  }
}

/** Verifies key and model id with one cheap call. */
export async function checkModel(ai: GoogleGenAI, model: string): Promise<void> {
  await boundedRequest(() => geminiCall(() => ai.models.get({ model })), 30000, 'Die Modellprüfung dauert zu lange. Bitte erneut versuchen.');
}

/** Variants that cannot transcribe audio (agents, image/speech generation, embeddings). */
export const NOT_FOR_AUDIO = /agent|image|tts|embedding|robotics|computer-use/i;

/** Model ids this key can use for content generation, e.g. "gemini-3.8-flash". */
export async function listModels(ai: GoogleGenAI): Promise<string[]> {
  return boundedRequest(() => geminiCall(async () => {
    const ids: string[] = [];
    for await (const m of await ai.models.list()) {
      const id = m.name?.replace(/^models\//, '');
      if (id?.startsWith('gemini') && !NOT_FOR_AUDIO.test(id) && (m.supportedActions ?? ['generateContent']).includes('generateContent')) ids.push(id);
    }
    return ids.sort();
  }), 30000, 'Die Modellliste konnte nicht rechtzeitig geladen werden. Bitte erneut versuchen.');
}

// ---------- Streaming generation ----------
// Transcripts come from the standard generateContent API, streamed: text arrives piece by piece, so the
// app can show progress and a slow answer is distinguishable from a stuck one. (The newer Interactions
// API was tried first; its background mode rejected audio and its direct requests were very slow on iOS.)

/** Before the first piece of text Gemini listens to the whole recording; after that text should flow steadily. */
const FIRST_CHUNK_MS = 5 * 60 * 1000;
const NEXT_CHUNK_MS = 2 * 60 * 1000;

export interface StreamOptions {
  /** JSON schema the answer must follow. */
  jsonSchema?: unknown;
  /** Called with the number of characters received so far. */
  onProgress?: (chars: number) => void;
  signal?: AbortSignal;
  firstChunkMs?: number;
}

/** Gemini says the model cannot take audio, e.g. "Audio input modality is not enabled for models/…". */
export function isAudioUnsupported(e: unknown): boolean {
  return e instanceof HttpError && e.status === 400 && /modality is not enabled|does not support audio/i.test(e.message);
}

function isThinkingUnsupported(e: unknown): boolean {
  return e instanceof HttpError && e.status === 400 && /thinking/i.test(e.message);
}

/** Text answer for a prompt plus an uploaded audio file. Low thinking: a verbatim transcript needs no reasoning. */
export async function streamText(ai: GoogleGenAI, model: string, prompt: string, audio: AudioInput, options: StreamOptions = {}): Promise<string> {
  const audioPart = 'data' in audio ? { inlineData: { data: audio.data, mimeType: audio.mimeType } } : { fileData: { fileUri: audio.uri, mimeType: audio.mimeType } };
  const timeout = options.firstChunkMs ?? FIRST_CHUNK_MS;
  const stalledMessage = 'Gemini antwortet nicht. Bitte „Erneut versuchen“, mit geöffneter App.';
  const config = (withThinking: boolean, signal: AbortSignal) => ({
    abortSignal: signal,
    ...(options.jsonSchema ? { responseMimeType: 'application/json', responseJsonSchema: options.jsonSchema } : {}),
    ...(withThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
  });
  const contents = [{ role: 'user', parts: [{ text: prompt }, audioPart] }];
  const run = async (withThinking: boolean): Promise<string> => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    let text = '';
    let lastTextAt = Date.now();
    const began = lastTextAt;
    try {
      const stream = await boundedRequest(
        () => geminiCall(() => ai.models.generateContentStream({ model, contents, config: config(withThinking, controller.signal) })),
        timeout, stalledMessage, options.signal,
      );
      const iterator = stream[Symbol.asyncIterator]();
      for (;;) {
        const next = await boundedRequest(() => geminiCall(() => iterator.next()), Math.max(1, Math.min((text ? NEXT_CHUNK_MS : timeout) - (Date.now() - lastTextAt), 20 * 60 * 1000 - (Date.now() - began))), stalledMessage, options.signal);
        if (next.done) break;
        const candidate = next.value.candidates?.[0];
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
          throw new UserError(candidate.finishReason === 'MAX_TOKENS'
            ? 'Das Transkript ist zu lang für eine Antwort. Bitte die Aufnahme in kürzere Teile aufteilen.'
            : `Gemini hat die Ausgabe beendet (${candidate.finishReason}). Bitte eine andere Aufnahme oder ein anderes Modell versuchen.`);
        }
        // Thought-only/empty chunks must not keep a stalled request alive indefinitely.
        const piece = next.value.text ?? '';
        if (piece) {
          lastTextAt = Date.now();
          text += piece;
          options.onProgress?.(text.length);
        }
      }
      if (!text) throw new UserError('Gemini hat keinen Text geliefert. Bitte Modell und Aufnahme prüfen.');
      return text;
    } catch (e) {
      controller.abort();
      // Some mobile connections cannot sustain SSE. Retry once with a regular JSON response.
      if (!options.signal?.aborted && !text && (isNetworkError(e) || (e instanceof UserError && e.message === stalledMessage))) {
        const response = await boundedRequest(
          (signal) => geminiCall(() => ai.models.generateContent({ model, contents, config: config(withThinking, signal) })),
          timeout, stalledMessage, options.signal,
        );
        const reason = response.candidates?.[0]?.finishReason;
        if (reason && reason !== 'STOP') throw new UserError(`Gemini hat die Antwort abgebrochen (${reason}). Bitte eine kürzere Aufnahme versuchen.`);
        if (!response.text) throw new UserError('Gemini hat keinen Text geliefert. Bitte Modell und Aufnahme prüfen.');
        options.onProgress?.(response.text.length);
        return response.text;
      }
      throw e;
    } finally {
      controller.abort();
      options.signal?.removeEventListener('abort', cancel);
    }
  };
  try {
    return await run(true);
  } catch (e) {
    if (isThinkingUnsupported(e)) return run(false);
    if (isAudioUnsupported(e)) {
      throw new UserError(`Das Modell „${model}“ kann keine Audiodateien verarbeiten. In den Einstellungen auf „Key prüfen“ tippen.`);
    }
    throw e;
  }
}

// ---------- Interactions responses ----------
// The response shape is still moving (`outputs` in the README, `steps` in the types); read both.

export interface TextContent {
  type: 'text';
  text: string;
  annotations?: Array<Record<string, unknown>>;
}

interface InteractionLike {
  output_text?: string;
  outputs?: unknown[];
  steps?: Array<{ type?: string; content?: unknown[] }>;
}

export function textContents(res: unknown): TextContent[] {
  const r = res as InteractionLike;
  const items: TextContent[] = [];
  const visit = (contents: unknown[] | undefined) => {
    for (const c of contents ?? []) if ((c as { type?: string })?.type === 'text') items.push(c as TextContent);
  };
  if (Array.isArray(r.outputs)) visit(r.outputs);
  for (const step of r.steps ?? []) if (step.type !== 'user_input') visit(step.content);
  return items;
}

export function outputText(res: unknown): string {
  const r = res as InteractionLike;
  if (typeof r.output_text === 'string' && r.output_text) return r.output_text;
  return textContents(res)
    .map((c) => c.text)
    .join('');
}
