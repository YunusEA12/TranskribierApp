import type { UploadedAudio } from '../jobs/queue';
import type { TranscriptResult } from '../types';

/** Lets a transcription survive the app being closed: the running interaction is persisted and resumed. */
export interface TranscribeContext {
  /** An interaction started earlier for this job, and the model it runs on. */
  resume?: { id: string; model: string };
  onStarted?: (id: string, model: string) => Promise<void>;
}

export interface TranscribeOptions {
  speakerCount?: number;
  glossary: string[];
  removeFillers: boolean;
}

/** Turns an uploaded audio file into a transcript. Engines are interchangeable (PLAN.md 3.2). */
export interface TranscriptionEngine {
  readonly model: string;
  transcribe(audio: UploadedAudio, options: TranscribeOptions, context?: TranscribeContext): Promise<TranscriptResult>;
}
