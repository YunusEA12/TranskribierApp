// Continuing a transcript that broke off: keep the complete segments of the broken answer, ask again from
// the last of them (PLAN.md 3.5), and join both parts. Pure logic.

import { parseClock } from '../lib/time';
import type { TranscriptResult } from '../types';
import { validateTranscriptResult } from './schema';

/** A continuation may begin a little before the requested time; anything earlier is a repeat and dropped. */
const RESUME_TOLERANCE_SEC = 10;
/**
 * A segment covers about a minute of speech, roughly 1,000 characters. Far more text without a new segment
 * means Gemini is caught in a loop, repeating the same words until its output limit.
 */
const LOOP_CHARS = 8000;

/**
 * Parses JSON that broke off midway: cuts after the last complete object or array and closes what is
 * still open. Returns null if nothing complete is there yet.
 */
export function parseTruncatedJson(text: string): unknown {
  const open: string[] = []; // closing characters still owed
  let inString = false;
  let escaped = false;
  let cut = -1;
  let owedAtCut: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
    } else if (c === '{') {
      open.push('}');
    } else if (c === '[') {
      open.push(']');
    } else if (c === '}' || c === ']') {
      if (open.pop() !== c) return null;
      cut = i + 1;
      owedAtCut = [...open];
    }
  }
  if (cut < 0) return null;
  try {
    return JSON.parse(text.slice(0, cut) + owedAtCut.reverse().join(''));
  } catch {
    return null;
  }
}

/** The usable part of a transcript answer that broke off, or null if no segment is complete. */
export function salvageTranscript(text: string): TranscriptResult | null {
  const raw = parseTruncatedJson(text) as { title?: unknown; segments?: unknown } | null;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.segments) || !raw.segments.length) return null;
  try {
    const result = validateTranscriptResult(raw);
    // The title may not have arrived; leave it empty so a later part can supply it.
    return typeof raw.title === 'string' ? result : { ...result, title: '' };
  } catch {
    return null;
  }
}

export interface ResumePlan {
  /** Segments that stay as they are. */
  kept: TranscriptResult;
  /** Where the next request starts, in seconds from the beginning of the recording. */
  resumeAtSec: number;
}

/**
 * Where to continue. Gemini chooses segment boundaries itself, so instead of guessing where the last segment
 * ended, it is transcribed again from its start. Null if too little is there to be worth keeping.
 */
export function resumePlan(partial: TranscriptResult): ResumePlan | null {
  if (partial.segments.length < 2) return null;
  const last = partial.segments[partial.segments.length - 1]!;
  const segments = partial.segments.slice(0, -1);
  const speakers = partial.speakers.filter((id) => segments.some((s) => s.speaker === id));
  return { kept: { ...partial, speakers, segments }, resumeAtSec: parseClock(last.start) ?? 0 };
}

/** Joins the kept part and its continuation; continuation segments from before the resume point are repeats. */
export function joinTranscripts(before: TranscriptResult, after: TranscriptResult, resumeAtSec: number): TranscriptResult {
  const fresh = after.segments.filter((s) => (parseClock(s.start) ?? resumeAtSec) >= resumeAtSec - RESUME_TOLERANCE_SEC);
  const segments = [...before.segments, ...fresh];
  const speakers = [...new Set([...before.speakers, ...after.speakers])].filter((id) => segments.some((s) => s.speaker === id));
  return { title: before.title || after.title, language: before.language || after.language, speakers, segments };
}

/** Start time of the newest segment in a transcript answer that is still arriving, in seconds. */
export function latestStartSec(text: string): number | undefined {
  // Quotes inside text values are escaped, so this finds keys only.
  const i = text.lastIndexOf('"start"');
  if (i < 0) return undefined;
  const value = /^"start"\s*:\s*"([^"]*)"/.exec(text.slice(i, i + 40))?.[1];
  return value === undefined ? undefined : (parseClock(value) ?? undefined);
}

/** True if the answer has run on far too long without a new segment (see LOOP_CHARS). */
export function looksStuck(text: string): boolean {
  return text.length - Math.max(0, text.lastIndexOf('"start"')) > LOOP_CHARS;
}
