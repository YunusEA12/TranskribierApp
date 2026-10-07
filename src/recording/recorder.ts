// Microphone recording. Chunks go to IndexedDB every few seconds so a crash or a killed tab loses at most
// the last few seconds; recoverSessions() turns leftovers into jobs.

import { db } from '../db/db';
import { enqueueAudio } from '../jobs/runner';

const CHUNK_MS = 5000;

export type RecorderState = 'idle' | 'recording' | 'paused';

export class Recorder {
  private media: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private sessionId = '';
  private seq = 0;
  private startedAt = 0;
  private accumulatedMs = 0;
  private runningSince = 0;
  private pendingWrites: Promise<unknown>[] = [];
  private speakerCount?: number;

  get state(): RecorderState {
    if (!this.media || this.media.state === 'inactive') return 'idle';
    return this.media.state === 'paused' ? 'paused' : 'recording';
  }

  get elapsedSec(): number {
    const running = this.state === 'recording' ? performance.now() - this.runningSince : 0;
    return (this.accumulatedMs + running) / 1000;
  }

  get activeSessionId(): string | undefined {
    return this.state === 'idle' ? undefined : this.sessionId;
  }

  get mimeType(): string {
    return this.media?.mimeType ?? '';
  }

  async start(speakerCount?: number): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // No mimeType option: the browser picks what it supports (iOS: audio/mp4, Chrome: audio/webm).
    this.media = new MediaRecorder(this.stream);
    this.sessionId = crypto.randomUUID();
    this.seq = 0;
    this.startedAt = Date.now();
    this.accumulatedMs = 0;
    this.runningSince = performance.now();
    this.speakerCount = speakerCount;
    this.media.ondataavailable = (e) => {
      if (!e.data.size) return;
      this.pendingWrites.push(
        db.chunks.add({
          sessionId: this.sessionId,
          seq: this.seq++,
          blob: e.data,
          mimeType: this.media?.mimeType || e.data.type,
          startedAt: this.startedAt,
          elapsedSec: this.elapsedSec,
        }),
      );
    };
    this.media.start(CHUNK_MS);
    await this.acquireWakeLock();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  pause(): void {
    if (this.state !== 'recording') return;
    this.media!.pause();
    this.accumulatedMs += performance.now() - this.runningSince;
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.media!.resume();
    this.runningSince = performance.now();
  }

  /** Stops, stores the recording as a job and returns the job id. */
  async stop(): Promise<string> {
    const media = this.media;
    if (!media || media.state === 'inactive') throw new Error('Keine laufende Aufnahme.');
    const durationSec = this.elapsedSec;
    await new Promise<void>((resolve) => {
      media.addEventListener('stop', () => resolve(), { once: true });
      media.stop();
    });
    this.cleanup();
    await Promise.all(this.pendingWrites);
    this.pendingWrites = [];
    return finalizeSession(this.sessionId, { durationSec, speakerCount: this.speakerCount });
  }

  /** Stops without keeping anything. */
  async discard(): Promise<void> {
    const media = this.media;
    if (media && media.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        media.addEventListener('stop', () => resolve(), { once: true });
        media.stop();
      });
    }
    this.cleanup();
    await Promise.all(this.pendingWrites);
    this.pendingWrites = [];
    await db.chunks.where('sessionId').equals(this.sessionId).delete();
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
  }

  private async acquireWakeLock() {
    try {
      this.wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
    } catch {
      // Not supported or denied; recording still works while the screen is on.
    }
  }

  // The browser drops the wake lock when the page is hidden; take it again on return.
  private onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && this.state !== 'idle') void this.acquireWakeLock();
  };
}

/** Assembles the chunks of a session into one audio job and deletes the chunks, atomically. */
async function finalizeSession(sessionId: string, opts: { durationSec?: number; speakerCount?: number } = {}): Promise<string> {
  const chunks = await db.chunks.where('[sessionId+seq]').between([sessionId, 0], [sessionId, Infinity]).toArray();
  const first = chunks[0];
  if (!first) throw new Error('Die Aufnahme ist leer.');
  const mimeType = first.mimeType;
  return enqueueAudio(
    {
      blob: new Blob(chunks.map((c) => c.blob), { type: mimeType }),
      mimeType,
      source: 'recording',
      recordedAt: first.startedAt,
      durationSec: opts.durationSec ?? chunks[chunks.length - 1]!.elapsedSec,
      speakerCount: opts.speakerCount,
    },
    () => db.chunks.where('sessionId').equals(sessionId).delete(),
  );
}

/** Recordings that were interrupted (tab killed, crash) and still have chunks on the device. */
export async function interruptedSessions(activeRecorder?: Recorder): Promise<Array<{ sessionId: string; startedAt: number; elapsedSec: number }>> {
  const sessions = new Map<string, { sessionId: string; startedAt: number; elapsedSec: number }>();
  await db.chunks.each((c) => {
    const s = sessions.get(c.sessionId) ?? { sessionId: c.sessionId, startedAt: c.startedAt, elapsedSec: 0 };
    s.elapsedSec = Math.max(s.elapsedSec, c.elapsedSec);
    sessions.set(c.sessionId, s);
  });
  const active = activeRecorder?.activeSessionId;
  return [...sessions.values()].filter((s) => s.sessionId !== active);
}

export function recoverSession(sessionId: string): Promise<string> {
  return finalizeSession(sessionId);
}
