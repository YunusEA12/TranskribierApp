// Shared Gemini plumbing: client, Files API upload/delete, reading Interactions responses.
// Together with the engines, the only place in the app that talks to Gemini.

import { GoogleGenAI } from '@google/genai';
import { HttpError, isNetworkError, UserError } from '../lib/errors';
import type { UploadedAudio } from '../jobs/queue';

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey: apiKey.trim() });
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

const POLL_MS = 2000;
const MAX_PROCESSING_MS = 10 * 60 * 1000;

export async function uploadAudio(ai: GoogleGenAI, blob: Blob, mimeType: string): Promise<UploadedAudio> {
  return geminiCall(async () => {
    let file = await ai.files.upload({ file: blob, config: { mimeType: geminiMimeType(mimeType), displayName: `mitschrift-${Date.now()}` } });
    const started = Date.now();
    while (file.state === 'PROCESSING') {
      if (Date.now() - started > MAX_PROCESSING_MS) throw new Error('Gemini verarbeitet die Datei zu lange.');
      await new Promise((r) => setTimeout(r, POLL_MS));
      file = await ai.files.get({ name: file.name! });
    }
    if (file.state === 'FAILED' || !file.name || !file.uri) throw new Error('Gemini konnte die Audiodatei nicht verarbeiten.');
    return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? geminiMimeType(mimeType), uploadedAt: Date.now() };
  });
}

/** Best effort: Gemini deletes files after 48 hours anyway. */
export async function deleteUpload(ai: GoogleGenAI, name: string): Promise<void> {
  try {
    await ai.files.delete({ name });
  } catch (e) {
    console.warn('Deleting uploaded file failed', e);
  }
}

/** Verifies key and model id with one cheap call. */
export async function checkModel(ai: GoogleGenAI, model: string): Promise<void> {
  await geminiCall(() => ai.models.get({ model }));
}

/** Variants that cannot transcribe audio (agents, image/speech generation, embeddings). */
export const NOT_FOR_AUDIO = /agent|image|tts|embedding|robotics|computer-use/i;

/** Model ids this key can use for content generation, e.g. "gemini-3.8-flash". */
export async function listModels(ai: GoogleGenAI): Promise<string[]> {
  return geminiCall(async () => {
    const ids: string[] = [];
    for await (const m of await ai.models.list()) {
      const id = m.name?.replace(/^models\//, '');
      if (id?.startsWith('gemini') && !NOT_FOR_AUDIO.test(id) && (m.supportedActions ?? ['generateContent']).includes('generateContent')) ids.push(id);
    }
    return ids.sort();
  });
}

// ---------- Background interactions ----------
// A long transcription can take minutes. iOS suspends a PWA that goes to the background and the
// browser drops the open request, so the interaction runs at Google in the background and the app
// only polls. The id is persisted by the caller, so polling resumes after the app was closed.

export class InteractionFailedError extends UserError {}

export interface BackgroundRun {
  /** Id of an interaction started earlier for the same request; polling resumes there. */
  resumeId?: string;
  /** Called once the interaction is accepted, so the caller can persist its id. */
  onStarted?: (id: string) => Promise<void>;
}

const POLL_FIRST_MS = 3000;
const POLL_MAX_MS = 15000;
const MAX_POLL_NETWORK_ERRORS = 8;
const MAX_WAIT_MS = 2 * 60 * 60 * 1000;
const POLL_TIMEOUT_MS = 30000;

type CreateParams = Parameters<GoogleGenAI['interactions']['create']>[0];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runInBackground(ai: GoogleGenAI, params: CreateParams, run: BackgroundRun = {}): Promise<unknown> {
  let id = run.resumeId;
  if (!id) {
    const created = (await geminiCall(() => ai.interactions.create({ ...params, background: true } as CreateParams))) as { id?: string; status?: string };
    if (created.status === 'completed') return created;
    if (!created.id) throw new InteractionFailedError('Gemini hat keine Auftragsnummer zurückgegeben.');
    id = created.id;
    await run.onStarted?.(id);
  }

  const started = Date.now();
  let delay = POLL_FIRST_MS;
  let networkErrors = 0;
  while (Date.now() - started < MAX_WAIT_MS) {
    await sleep(delay);
    delay = Math.min(POLL_MAX_MS, Math.round(delay * 1.4));
    let interaction: { status?: string };
    try {
      interaction = (await geminiCall(() => ai.interactions.get(id, undefined, { timeout: POLL_TIMEOUT_MS, maxRetries: 0 }))) as { status?: string };
      networkErrors = 0;
    } catch (e) {
      // A poll that died with the app in the background is harmless; ask again.
      if (isNetworkError(e) && ++networkErrors < MAX_POLL_NETWORK_ERRORS) continue;
      throw e;
    }
    switch (interaction.status) {
      case 'completed':
        return interaction;
      case 'failed':
      case 'cancelled':
      case 'incomplete':
      case 'budget_exceeded':
        throw new InteractionFailedError(`Gemini hat die Transkription abgebrochen (Status: ${interaction.status}).`);
    }
  }
  throw new InteractionFailedError('Gemini braucht ungewöhnlich lange. Bitte später erneut versuchen.');
}

/** Gemini says the model cannot take audio, e.g. "Audio input modality is not enabled for models/…". */
export function isAudioUnsupported(e: unknown): boolean {
  return e instanceof HttpError && e.status === 400 && /modality is not enabled|does not support audio/i.test(e.message);
}

/**
 * Runs a transcription in the background (see runInBackground). If Gemini rejects the audio in that
 * mode, the same request runs once as a normal request before giving up with a clear message.
 */
export async function runTranscription(ai: GoogleGenAI, params: CreateParams, run: BackgroundRun, model: string): Promise<unknown> {
  try {
    return await runInBackground(ai, params, run);
  } catch (e) {
    if (!isAudioUnsupported(e)) throw e;
    console.warn(`Background run rejected audio for ${model}; trying a normal request`, e);
  }
  try {
    return await geminiCall(() => ai.interactions.create(params));
  } catch (e) {
    if (isAudioUnsupported(e)) {
      throw new UserError(`Das Modell „${model}“ kann keine Audiodateien verarbeiten. In den Einstellungen auf „Key prüfen“ tippen, dort wird ein passendes vorgeschlagen.`);
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
