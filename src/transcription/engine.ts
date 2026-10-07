import type { UploadedAudio } from '../jobs/queue';
import type { TranscriptResult } from '../types';

/** Lets a transcription survive the app being closed: the running interaction is persisted and resumed. */
export interface TranscribeContext {
  /** An interaction started earlier for this job, and the model it runs on. */
  resume?: { id: string; model: string };
  onStarted?: (id: string, model: string) => Promise<void>;
  /** Gemini's status of the running interaction, for display. */
  onPoll?: (status: string) => Promise<void> | void;
}

/** How long to wait for a background run before trying a normal request: real time plus 3 minutes, at least 4. */
export function backgroundWaitMs(durationSec = 0): number {
  return Math.max(4 * 60_000, (durationSec + 180) * 1000);
}

export interface TranscribeOptions {
  speakerCount?: number;
  glossary: string[];
  removeFillers: boolean;
  /** Length of the audio; bounds how long a background run may take. */
  durationSec?: number;
}

/** Turns an uploaded audio file into a transcript. Engines are interchangeable (PLAN.md 3.2). */
export interface TranscriptionEngine {
  readonly model: string;
  transcribe(audio: UploadedAudio, options: TranscribeOptions, context?: TranscribeContext): Promise<TranscriptResult>;
}
