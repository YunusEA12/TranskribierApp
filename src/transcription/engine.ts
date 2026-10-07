import type { UploadedAudio } from '../jobs/queue';
import type { TranscriptResult } from '../types';

export interface TranscribeOptions {
  speakerCount?: number;
  glossary: string[];
  removeFillers: boolean;
}

/** Turns an uploaded audio file into a transcript. Engines are interchangeable (PLAN.md 3.2). */
export interface TranscriptionEngine {
  readonly model: string;
  transcribe(audio: UploadedAudio, options: TranscribeOptions): Promise<TranscriptResult>;
}
