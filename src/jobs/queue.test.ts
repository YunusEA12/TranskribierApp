import { describe, expect, it } from 'vitest';
import {
  UPLOAD_TTL_MS, currentStep, isRunnable, newJob, nextStatus, retry, savingDone, stepFailed, stepStarted,
  transcriptionDone, uploadDone, type Job,
} from './queue';

const base = newJob({ id: 'a', recordedAt: 0, source: 'recording', mimeType: 'audio/webm', durationSec: 60 }, 1000);
const apply = (job: Job, patch: Partial<Job>): Job => ({ ...job, ...patch });
const upload = { name: 'files/x', uri: 'u', mimeType: 'audio/webm', uploadedAt: 2000 };
const result = { title: 'T', language: 'de', speakers: ['S1'], segments: [{ speaker: 'S1', start: '00:00', text: 'x' }] };

describe('job state machine', () => {
  it('walks through the happy path', () => {
    let job = base;
    expect(job.status).toBe('recorded');
    expect(currentStep(job, 1000)).toBe('uploading');
    job = apply(job, stepStarted('uploading', 1500));
    job = apply(job, uploadDone(upload, 2000));
    expect(currentStep(job, 3000)).toBe('transcribing');
    job = apply(job, transcriptionDone(result, 'm', 4000));
    expect(currentStep(job, 4000)).toBe('saving');
    job = apply(job, savingDone('Transkripte/2026/x.md', 5000));
    expect(job.status).toBe('done');
    expect(isRunnable(job)).toBe(false);
    expect(currentStep(job, 5000)).toBeNull();
  });

  it('nextStatus follows the documented order', () => {
    expect(nextStatus('recorded')).toBe('uploading');
    expect(nextStatus('saving')).toBe('done');
    expect(() => nextStatus('done')).toThrow();
  });

  it('retries the failed step and keeps earlier results', () => {
    let job = apply(apply(base, uploadDone(upload, 2000)), transcriptionDone(result, 'm', 3000));
    job = apply(job, stepFailed('saving', 'kaputt', 4000));
    expect(isRunnable(job)).toBe(false);
    expect(job.error).toBe('kaputt');
    job = apply(job, retry(job, 5000));
    expect(job.status).toBe('saving');
    expect(job.error).toBeUndefined();
    expect(job.result).toEqual(result);
  });

  it('re-uploads when the upload expired before transcription', () => {
    const uploaded = apply(base, uploadDone(upload, 2000));
    const later = 2000 + UPLOAD_TTL_MS + 1;
    expect(currentStep(uploaded, later)).toBe('uploading');
    const failed = apply(uploaded, stepFailed('transcribing', 'x', 3000));
    expect(retry(failed, later).status).toBe('uploading');
    expect(retry(failed, 4000).status).toBe('transcribing');
  });

  it('retry is a no-op for jobs that did not fail', () => {
    expect(retry(base, 1)).toEqual({});
  });
});
