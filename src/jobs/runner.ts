// Executes jobs step by step. Runs in the page; a job interrupted by closing the app resumes on the next start.

import { db } from '../db/db';
import { boundedRequest } from '../lib/request';
import { toUserMessage, UserError, HttpError } from '../lib/errors';
import { allGeminiKeys, getSettings, missingSettings, storageConnected } from '../settings/settingsStore';
import { createEngine } from '../transcription/createEngine';
import type { AudioInput } from '../transcription/engine';
import { isQuotaError } from '../transcription/fallbackEngine';
import { createGeminiClient, deleteUpload, geminiMimeType, INLINE_MAX_BYTES, uploadAudio } from '../transcription/gemini';
import { blobToBase64 } from '../lib/blob';
import { untilForeground } from '../lib/foreground';
import type { AudioSource, TranscriptMeta } from '../types';
import { createTranscript, toMarkdown } from '../vault/markdown';
import { parseTranscriptPath, transcriptPath } from '../vault/paths';
import { clientFromSettings, saveTranscript, TranscriptCollisionError } from '../vault/vaultRepo';

import {
  currentStep, isRunnable, newJob, retry, savingDone, stepFailed, stepStarted, transcriptionDone, uploadDone,
  type Job, type Step,
} from './queue';

export interface NewAudio {
  blob: Blob;
  mimeType: string;
  source: AudioSource;
  recordedAt: number;
  durationSec: number;
  fileName?: string;
  speakerCount?: number;
}

/** Stores the audio and its job in one transaction, then starts processing. */
export async function enqueueAudio(audio: NewAudio, extraWrites?: () => Promise<unknown>): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.transaction('rw', [db.audio, db.jobs, db.chunks], async () => {
    await db.audio.add({ id, blob: audio.blob, mimeType: audio.mimeType, createdAt: now });
    await db.jobs.add(
      newJob(
        {
          id,
          recordedAt: audio.recordedAt,
          source: audio.source,
          mimeType: audio.mimeType,
          durationSec: audio.durationSec,
          fileName: audio.fileName,
          speakerCount: audio.speakerCount,
        },
        now,
      ),
    );
    await extraWrites?.();
  });
  kickRunner();
  return id;
}

export async function retryJob(id: string): Promise<void> {
  const job = await db.jobs.get(id);
  if (!job) return;
  await db.jobs.update(id, retry(job, Date.now()));
  kickRunner();
}

/** Removes a job with its local audio and transcript, and the upload at Gemini if there is one. */
export async function discardJob(id: string): Promise<void> {
  await stopJob(id);
  const job = await db.jobs.get(id);
  const settings = getSettings();
  const deleteKey = job?.upload?.key || settings.geminiKey;
  if (job?.upload?.name && job.status !== 'done' && deleteKey) {
    await deleteUpload(createGeminiClient(deleteKey), job.upload.name);
  }
  await db.transaction('rw', [db.jobs, db.audio, db.transcripts], async () => {
    await db.jobs.delete(id);
    await db.audio.delete(id);
    await db.transcripts.delete(id);
  });
}


/** A vault path no other transcript on this device uses ("… (2).md" on collisions). */
async function uniquePath(jobId: string, meta: Pick<TranscriptMeta, 'date' | 'time' | 'title'>, user: string): Promise<string> {
  for (let n = 1; ; n++) {
    const path = transcriptPath(meta.date, meta.time, meta.title, { user, suffix: n });
    const taken = await db.transcripts.where('path').equals(path).filter((t) => t.id !== jobId).count();
    const remote = await db.remote.get(path);
    if (!taken && !remote) return path;
  }
}

const active = new Map<string, { controller: AbortController; done: Promise<void> }>();
export function processingActive(): boolean { return running; }

/** Stops a stuck operation without deleting its recording, then permits a safe retry. */
export async function stopJob(id: string): Promise<void> {
  const operation = active.get(id);
  if (!operation) return;
  operation.controller.abort(new UserError('Verarbeitung angehalten. Die Aufnahme bleibt gespeichert. Bitte „Erneut versuchen“.'));
  await operation.done;
}

let running = false;
let kickedWhileRunning = false;

/** Processes all runnable jobs, oldest first. Safe to call any time. */
export function kickRunner(): void {
  if (running) {
    // A job may have been added after the loop last looked; go around once more when done.
    kickedWhileRunning = true;
    return;
  }
  running = true;
  kickedWhileRunning = false;
  void runAll().catch(() => { console.warn('Job queue could not continue; local recordings are retained.'); }).finally(() => {
    running = false;
    if (kickedWhileRunning) kickRunner();
  });
}

async function runAll(): Promise<void> {
  const attempted = new Set<string>();
  for (;;) {
    if (missingSettings(getSettings()).length || !navigator.onLine) return;
    const jobs = await db.jobs.orderBy('recordedAt').filter((j) => isRunnable(j) && !attempted.has(j.id)).toArray();
    const job = jobs[0];
    if (!job) break;
    attempted.add(job.id);
    await runJob(job.id);
  }
  await uploadPendingTranscripts();
}

/** Writes a transcript to the shared storage and records that it is there. */
async function uploadTranscript(id: string, path: string, markdown: string, title: string): Promise<void> {
  const client = clientFromSettings(getSettings());
  const originalPath = path;
  let sha = '';
  for (let suffix = 2; ; suffix++) {
    if (suffix > 100) throw new UserError('Zu viele Dateikonflikte im Speicher. Bitte erneut versuchen.');
    if (path !== originalPath && await db.transcripts.where('path').equals(path).filter((t) => t.id !== id).count()) {
      path = originalPath.replace(/(?: \(\d+\))?\.md$/, ` (${suffix}).md`);
      continue;
    }
    try {
      sha = await saveTranscript(client, path, markdown, title);
      break;
    } catch (e) {
      if (!(e instanceof TranscriptCollisionError) && !(e instanceof HttpError && e.status === 409)) throw e;
      path = originalPath.replace(/(?: \(\d+\))?\.md$/, ` (${suffix}).md`);
    }
  }
  const info = parseTranscriptPath(path);
  await db.transaction('rw', [db.transcripts, db.remote, db.remoteFiles, db.jobs], async () => {
    await db.transcripts.update(id, { githubPath: path, path });
    await db.jobs.update(id, { ...savingDone(path, Date.now()), error: undefined, failedStep: undefined });
    if (info) await db.remote.put({ ...info, sha });
    await db.remoteFiles.put({ path, sha, text: markdown });
  });
}

/** Transcripts made before the storage was connected (or whose upload failed) are sent afterwards. */
async function uploadPendingTranscripts(): Promise<void> {
  if (!storageConnected(getSettings())) return;
  const pending = await db.transcripts.filter((t) => !t.githubPath).toArray();
  for (const t of pending) {
    try {
      await uploadTranscript(t.id, t.path, t.markdown, t.title);
      const job = await db.jobs.get(t.id);
      const deleteKey = job?.upload?.key || getSettings().geminiKey;
      if (job?.upload?.name && deleteKey) await deleteUpload(createGeminiClient(deleteKey), job.upload.name);
    } catch {
      console.warn('Transcript upload failed; local copy retained.');
      return;
    }
  }
}

async function runJob(id: string): Promise<void> {
  const controller = new AbortController();
  let finish: () => void = () => {};
  const done = new Promise<void>((resolve) => { finish = resolve; });
  active.set(id, { controller, done });
  try {
    const settings = getSettings();
    const keys = allGeminiKeys(settings);
    let keyIdx = 0;

    while (keyIdx < Math.max(1, keys.length)) {
      const currentKey = keys[keyIdx] || settings.geminiKey;
      const ai = createGeminiClient(currentKey);
      let advanceKey = false;

      for (;;) {
        const job = await db.jobs.get(id);
        if (!job || !isRunnable(job)) return;
        const step = currentStep(job, Date.now());
        if (!step) return;
        await db.jobs.update(id, stepStarted(step, Date.now()));
        try {
          await runStep(step, job, settings, ai, currentKey, controller.signal);
        } catch (e) {
          if (controller.signal.aborted) {
            console.warn(`Job stopped at ${step}; audio retained.`);
            const patch = stepFailed(step, toUserMessage(e, step === 'saving' ? 'github' : 'gemini'), Date.now());
            if (step === 'transcribing') Object.assign(patch, { progressChars: undefined, progressSec: undefined, waitUntil: undefined });
            await db.jobs.update(id, patch);
            return;
          }

          const isKeyOrQuota = step !== 'saving' && (isQuotaError(e) || (e instanceof HttpError && [400, 401, 403, 429].includes(e.status)));
          if (isKeyOrQuota && keyIdx + 1 < keys.length) {
            console.warn(`Key ${keyIdx + 1} failed at ${step}, falling back to key ${keyIdx + 2}`);
            keyIdx++;
            advanceKey = true;
            break;
          }

          console.warn(`Job failed at ${step}; audio retained.`);
          const patch = stepFailed(step, toUserMessage(e, step === 'saving' ? 'github' : 'gemini'), Date.now());
          if (step === 'transcribing') Object.assign(patch, { progressChars: undefined, progressSec: undefined, waitUntil: undefined });
          await db.jobs.update(id, patch);
          return;
        }
      }

      if (!advanceKey) break;
    }
  } finally {
    active.delete(id);
    finish();
  }
}

async function runStep(step: Step, job: Job, settings: ReturnType<typeof getSettings>, ai: ReturnType<typeof createGeminiClient>, currentKey: string, signal: AbortSignal) {
  switch (step) {
    case 'uploading': {
      const audio = await db.audio.get(job.id);
      if (!audio) throw new UserError('Die Audiodatei ist auf diesem Gerät nicht mehr vorhanden.');
      // Small recordings skip the Files API and travel inside the transcription request: one round trip less.
      const upload =
        audio.blob.size <= INLINE_MAX_BYTES
          ? { name: '', uri: '', mimeType: geminiMimeType(job.mimeType), uploadedAt: Date.now(), inline: true, key: currentKey }
          : { ...(await uploadAudio(ai, audio.blob, job.mimeType, signal)), key: currentKey };
      await db.jobs.update(job.id, uploadDone(upload, Date.now()));
      return;
    }
    case 'transcribing': {
      const engine = createEngine(ai, settings);
      let input: AudioInput;
      const audio = await db.audio.get(job.id);
      if (!audio) throw new UserError('Die Audiodatei ist auf diesem Gerät nicht mehr vorhanden.');

      // Also upgrade jobs that were already uploaded by an older app version.
      if (job.upload!.inline || audio.blob.size <= INLINE_MAX_BYTES) {
        input = { data: await blobToBase64(audio.blob), mimeType: job.upload!.mimeType };
      } else {
        // If the upload was created with a different key, re-upload with currentKey
        if (job.upload?.key && job.upload.key !== currentKey) {
          const newUpload = { ...(await uploadAudio(ai, audio.blob, job.mimeType, signal)), key: currentKey };
          await db.jobs.update(job.id, { upload: newUpload });
          job.upload = newUpload;
        }
        input = { uri: job.upload!.uri, mimeType: job.upload!.mimeType };
      }
      let lastWrite = 0;
      const result = await boundedRequest((operationSignal) => engine.transcribe(
        input,
        { speakerCount: job.speakerCount, glossary: [], removeFillers: settings.removeFillers },
        {
          signal: operationSignal,
          firstChunkMs: Math.min(300000, Math.max(90000, job.durationSec * 1000)),
          // Progress for the job card, written at most once a second.
          onProgress: (chars, positionSec) => {
            if (operationSignal.aborted || Date.now() - lastWrite < 1000) return;
            lastWrite = Date.now();
            void db.jobs.update(job.id, { progressChars: chars, ...(positionSec !== undefined ? { progressSec: positionSec } : {}) }).catch(() => {});
          },
          // A broken-off answer is kept, so neither the automatic retry nor "Erneut versuchen" starts over.
          resumeFrom: job.partialResult,
          onPartial: async (partial) => {
            if (!operationSignal.aborted) await db.jobs.update(job.id, { partialResult: partial, progressChars: undefined });
          },
          beforeRetry: () => untilForeground(operationSignal),
          onWait: async (until) => {
            if (!operationSignal.aborted) await db.jobs.update(job.id, { waitUntil: until });
          },
        },
      ), 20 * 60 * 1000, 'Die Transkription dauert zu lange. Die Aufnahme bleibt gespeichert. Bitte erneut versuchen.', signal);
      await db.jobs.update(job.id, transcriptionDone(result, engine.model, Date.now()));
      return;
    }
    case 'saving': {
      const transcript = createTranscript(job.result!, {
        recordedAt: new Date(job.recordedAt),
        durationSec: job.durationSec,
        user: settings.userName,
        model: job.model ?? '',
        source: job.source,
      });
      const { meta } = transcript;
      const markdown = toMarkdown(transcript);
      // Keep the path across retries; identical content confirms a previous successful upload.
      const path = job.vaultPath ?? (await uniquePath(job.id, meta, settings.userName));
      const existing = await db.transcripts.get(job.id);
      await db.transaction('rw', [db.jobs, db.transcripts], async () => {
        await db.transcripts.put({
          ...existing,
          id: job.id,
          path,
          title: meta.title,
          date: meta.date,
          time: meta.time,
          durationMin: meta.durationMin,
          speakerCount: Object.keys(meta.speakers).length,
          markdown,
          createdAt: existing?.createdAt ?? Date.now(),
        });
        await db.jobs.update(job.id, { vaultPath: path });
      });
      await uploadTranscript(job.id, path, markdown, meta.title);
      // The transcript is safe on the device; the copy at Google is no longer needed (CLAUDE.md rule 8).
      if (job.upload?.name) {
        const deleteClient = job.upload.key ? createGeminiClient(job.upload.key) : ai;
        await deleteUpload(deleteClient, job.upload.name);
      }
      return;
    }
  }
}

