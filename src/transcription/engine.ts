import type { TranscriptResult } from '../types';

/** The recording for Gemini: a file in the Files API, or (for small recordings) the bytes themselves, base64. */
export type AudioInput = { uri: string; mimeType: string } | { data: string; mimeType: string };

export interface TranscribeContext {
  signal?: AbortSignal;
  firstChunkMs?: number;
  /** Number of characters Gemini has sent so far, for a progress display. */
  onProgress?: (chars: number) => void;
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
