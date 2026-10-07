// State machine per recording: recorded -> uploading -> transcribing -> saving -> done.
// Every step can fail and be retried; the audio itself is never touched by a failure.
// This file is pure logic; jobs/runner.ts performs the steps.

import type { AudioSource, TranscriptResult } from '../types';

export type Step = 'uploading' | 'transcribing' | 'saving';
export type JobStatus = 'recorded' | Step | 'done' | 'failed';

/** Gemini deletes uploaded files after 48 hours; treat them as gone a bit earlier. */
export const UPLOAD_TTL_MS = 47 * 60 * 60 * 1000;

export interface UploadedAudio {
  name: string;
  uri: string;
  mimeType: string;
  uploadedAt: number;
}

export interface Job {
  id: string; // also the key of the audio in IndexedDB
  recordedAt: number;
  updatedAt: number;
  status: JobStatus;
  failedStep?: Step;
  error?: string;
  source: AudioSource;
  mimeType: string;
  durationSec: number;
  fileName?: string;
  speakerCount?: number;
  upload?: UploadedAudio;
  /** Gemini interaction running in the background for this job, so polling can resume after the app was closed. */
  interactionId?: string;
  interactionModel?: string;
  result?: TranscriptResult;
  model?: string;
  vaultPath?: string;
}

export interface NewJobInput {
  id: string;
  recordedAt: number;
  source: AudioSource;
  mimeType: string;
  durationSec: number;
  fileName?: string;
  speakerCount?: number;
}

export function newJob(input: NewJobInput, now: number): Job {
  return { ...input, status: 'recorded', updatedAt: now };
}

const ORDER: JobStatus[] = ['recorded', 'uploading', 'transcribing', 'saving', 'done'];

export function nextStatus(status: JobStatus): JobStatus {
  const i = ORDER.indexOf(status);
  if (i < 0 || i === ORDER.length - 1) throw new Error(`No next status after "${status}"`);
  return ORDER[i + 1]!;
}

export function isRunnable(job: Job): boolean {
  return job.status !== 'done' && job.status !== 'failed';
}

export function uploadExpired(job: Job, now: number): boolean {
  return !job.upload || now - job.upload.uploadedAt > UPLOAD_TTL_MS;
}

/** The step to run next for a runnable job, skipping a transcription whose upload has expired. */
export function currentStep(job: Job, now: number): Step | null {
  switch (job.status) {
    case 'recorded':
    case 'uploading':
      return 'uploading';
    case 'transcribing':
      return uploadExpired(job, now) ? 'uploading' : 'transcribing';
    case 'saving':
      return 'saving';
    default:
      return null;
  }
}

export function stepStarted(step: Step, now: number): Partial<Job> {
  return { status: step, error: undefined, failedStep: undefined, updatedAt: now };
}

export function uploadDone(upload: UploadedAudio, now: number): Partial<Job> {
  // A new upload means a new file; an interaction on the old one is useless.
  return { status: 'transcribing', upload, interactionId: undefined, interactionModel: undefined, updatedAt: now };
}

export function transcriptionDone(result: TranscriptResult, model: string, now: number): Partial<Job> {
  return { status: 'saving', result, model, interactionId: undefined, interactionModel: undefined, updatedAt: now };
}

export function savingDone(vaultPath: string, now: number): Partial<Job> {
  return { status: 'done', vaultPath, updatedAt: now };
}

export function stepFailed(step: Step, message: string, now: number): Partial<Job> {
  return { status: 'failed', failedStep: step, error: message, updatedAt: now };
}

/** Puts a failed job back to the step that failed (or earlier, if its upload has expired). */
export function retry(job: Job, now: number): Partial<Job> {
  if (job.status !== 'failed') return {};
  let status: JobStatus = job.failedStep ?? 'recorded';
  if (status === 'transcribing' && uploadExpired(job, now)) status = 'uploading';
  return { status, error: undefined, failedStep: undefined, updatedAt: now };
}
