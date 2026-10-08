import type { TranscriptResult } from '../types';

/** The recording for Gemini: a file in the Files API, or (for small recordings) the bytes themselves, base64. */
export type AudioInput = { uri: string; mimeType: string } | { data: string; mimeType: string };

export interface TranscribeContext {
  signal?: AbortSignal;
  firstChunkMs?: number;
  /** Number of characters Gemini has sent so far, for a progress display. */
  onProgress?: (chars: number) => void;
  /** What an earlier, interrupted attempt already transcribed; the engine continues after it. */
  resumeFrom?: TranscriptResult;
  /** Everything transcribed so far, whenever an answer broke off; stored so a later retry can continue. */
  onPartial?: (partial: TranscriptResult) => Promise<void> | void;
  /** Waits before the engine retries on its own after a break (e.g. until the app is open again). */
  beforeRetry?: () => Promise<void>;
}

export interface TranscribeOptions {
  speakerCount?: number;
  glossary: string[];
  removeFillers: boolean;
}

/** Turns an uploaded audio file into a transcript. Engines are interchangeable (PLAN.md 3.2). */
export interface TranscriptionEngine {
  readonly model: string;
  transcribe(audio: AudioInput, options: TranscribeOptions, context?: TranscribeContext): Promise<TranscriptResult>;
}
