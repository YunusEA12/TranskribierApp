// Executes jobs step by step. Runs in the page; a job interrupted by closing the app resumes on the next start.

import { db } from '../db/db';
import { toUserMessage, UserError } from '../lib/errors';
import { getSettings, missingSettings, storageConnected } from '../settings/settingsStore';
import { createEngine } from '../transcription/createEngine';
import type { AudioInput } from '../transcription/engine';
import { createGeminiClient, deleteUpload, geminiMimeType, INLINE_MAX_BYTES, uploadAudio } from '../transcription/gemini';
import { blobToBase64 } from '../lib/blob';
import type { AudioSource, TranscriptMeta } from '../types';
import { createTranscript, toMarkdown } from '../vault/markdown';
import { parseTranscriptPath, transcriptPath } from '../vault/paths';
import { clientFromSettings, saveTranscript } from '../vault/vaultRepo';
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
  const job = await db.jobs.get(id);
  if (job?.upload?.name && job.status !== 'done' && getSettings().geminiKey) {
    await deleteUpload(createGeminiClient(getSettings().geminiKey), job.upload.name);
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
    if (!taken) return path;
  }
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
  void runAll().finally(() => {
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
  const sha = await saveTranscript(clientFromSettings(getSettings()), path, markdown, title);
  const info = parseTranscriptPath(path);
  await db.transaction('rw', [db.transcripts, db.remote, db.remoteFiles], async () => {
    await db.transcripts.update(id, { githubPath: path });
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
    } catch (e) {
      console.warn(`Upload of ${t.path} failed; will retry later`, e);
      return;
    }
  }
}

async function runJob(id: string): Promise<void> {
  const settings = getSettings();
  const ai = createGeminiClient(settings.geminiKey);
  for (;;) {
    const job = await db.jobs.get(id);
    if (!job || !isRunnable(job)) return;
    const step = currentStep(job, Date.now());
    if (!step) return;
    await db.jobs.update(id, stepStarted(step, Date.now()));
    try {
      await runStep(step, job, settings, ai);
    } catch (e) {
      console.error(`Job ${id} failed at ${step}`, e);
      const patch = stepFailed(step, toUserMessage(e, step === 'saving' ? 'github' : 'gemini'), Date.now());
      if (step === 'transcribing') patch.progressChars = undefined;
      await db.jobs.update(id, patch);
      return;
    }
  }
}

async function runStep(step: Step, job: Job, settings: ReturnType<typeof getSettings>, ai: ReturnType<typeof createGeminiClient>) {
  switch (step) {
    case 'uploading': {
      const audio = await db.audio.get(job.id);
      if (!audio) throw new UserError('Die Audiodatei ist auf diesem Gerät nicht mehr vorhanden.');
      // Small recordings skip the Files API and travel inside the transcription request: one round trip less.
      const upload =
        audio.blob.size <= INLINE_MAX_BYTES
          ? { name: '', uri: '', mimeType: geminiMimeType(job.mimeType), uploadedAt: Date.now(), inline: true }
          : await uploadAudio(ai, audio.blob, job.mimeType);
      await db.jobs.update(job.id, uploadDone(upload, Date.now()));
      return;
    }
    case 'transcribing': {
      const engine = createEngine(ai, settings);
      let input: AudioInput = { uri: job.upload!.uri, mimeType: job.upload!.mimeType };
      if (job.upload!.inline) {
        const audio = await db.audio.get(job.id);
        if (!audio) throw new UserError('Die Audiodatei ist auf diesem Gerät nicht mehr vorhanden.');
        input = { data: await blobToBase64(audio.blob), mimeType: job.upload!.mimeType };
      }
      let lastWrite = 0;
      const result = await engine.transcribe(
        input,
        { speakerCount: job.speakerCount, glossary: [], removeFillers: settings.removeFillers },
        {
          // Progress for the job card, written at most once a second.
          onProgress: (chars) => {
            if (Date.now() - lastWrite < 1000) return;
            lastWrite = Date.now();
            void db.jobs.update(job.id, { progressChars: chars });
          },
        },
      );
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
      // The path stays fixed across retries, so a second upload overwrites instead of duplicating.
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
      await db.jobs.update(job.id, savingDone(path, Date.now()));
      // The transcript is safe on the device; the copy at Google is no longer needed (CLAUDE.md rule 8).
      if (job.upload?.name) await deleteUpload(ai, job.upload.name);
      return;
    }
  }
}
