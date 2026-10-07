// Shared Gemini plumbing: client, Files API upload/delete, reading Interactions responses.
// Together with the engines, the only place in the app that talks to Gemini.

import { GoogleGenAI } from '@google/genai';
import { HttpError } from '../lib/errors';
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

/** Model ids this key can use for content generation, e.g. "gemini-3.8-flash". */
export async function listModels(ai: GoogleGenAI): Promise<string[]> {
  return geminiCall(async () => {
    const ids: string[] = [];
    for await (const m of await ai.models.list()) {
      const id = m.name?.replace(/^models\//, '');
      if (id?.startsWith('gemini') && (m.supportedActions ?? ['generateContent']).includes('generateContent')) ids.push(id);
    }
    return ids.sort();
  });
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
