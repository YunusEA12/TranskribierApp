// JSON schema for the flash engine's structured output, and validation of what comes back.

import { formatClock, parseClock } from '../lib/time';
import type { Segment, TranscriptResult } from '../types';

export const TRANSCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Topic of the recording, max 8 words, in the language of the recording.' },
    language: { type: 'string', description: 'Main language as ISO 639-1 code, e.g. "de".' },
    speakers: {
      type: 'array',
      items: { type: 'string' },
      description: 'Speaker labels S1..Sn in order of first appearance.',
    },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string' },
          start: { type: 'string', description: 'Start time as MM:SS, or HH:MM:SS from one hour on.' },
          text: { type: 'string' },
        },
        required: ['speaker', 'start', 'text'],
      },
    },
  },
  required: ['title', 'language', 'speakers', 'segments'],
} as const;

export class TranscriptValidationError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Checks the model output and normalizes it: timestamps to MM:SS / HH:MM:SS, speaker list covering every
 * segment, empty segments dropped. Throws TranscriptValidationError if the shape is unusable.
 */
export function validateTranscriptResult(raw: unknown): TranscriptResult {
  if (!isRecord(raw)) throw new TranscriptValidationError('Antwort ist kein Objekt.');
  if (!Array.isArray(raw.segments)) throw new TranscriptValidationError('Antwort enthält keine Segmente.');

  const segments: Segment[] = [];
  raw.segments.forEach((s, i) => {
    if (!isRecord(s) || typeof s.text !== 'string') throw new TranscriptValidationError(`Segment ${i + 1} ist ungültig.`);
    const text = s.text.trim();
    if (!text) return;
    const speaker = typeof s.speaker === 'string' && s.speaker.trim() ? s.speaker.trim() : 'S1';
    const seconds = typeof s.start === 'string' ? parseClock(s.start) : typeof s.start === 'number' ? s.start : null;
    // An unreadable timestamp inherits the previous one rather than failing the whole transcript.
    const start = seconds !== null ? formatClock(seconds) : (segments[segments.length - 1]?.start ?? '00:00');
    segments.push({ speaker, start, text });
  });
  if (!segments.length) throw new TranscriptValidationError('Transkript ist leer.');

  const speakers: string[] = [];
  const declared = Array.isArray(raw.speakers) ? raw.speakers.filter((x): x is string => typeof x === 'string') : [];
  for (const id of [...declared.map((x) => x.trim()), ...segments.map((s) => s.speaker)]) {
    if (id && !speakers.includes(id) && segments.some((s) => s.speaker === id)) speakers.push(id);
  }

  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Transkript';
  const language = typeof raw.language === 'string' ? raw.language.trim().toLowerCase() : '';
  return { title, language, speakers, segments };
}
