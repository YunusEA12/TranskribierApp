// Microphone recording. Chunks go to IndexedDB every few seconds so a crash or a killed tab loses at most
// the last few seconds; recoverSessions() turns leftovers into jobs.

import { db } from '../db/db';
import { enqueueAudio } from '../jobs/runner';
import { UserError } from '../lib/errors';

const CHUNK_MS = 5000;

export type RecorderState = 'idle' | 'recording' | 'paused';

/** A stretch of time in which the app was in the background; iOS does not record during it. */
export interface BackgroundGap {
  from: number;
  to: number;
}

export class Recorder {
  private media: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private sessionId = '';
  private seq = 0;
  private startedAt = 0;
  private accumulatedMs = 0;
  private runningSince = 0;
  private clockRunning = false;
  private pendingWrites: Promise<unknown>[] = [];
  private speakerCount?: number;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Uint8Array<ArrayBuffer> | null = null;
  private hiddenSince: number | null = null;
  /** Times the app was in the background during the current recording. */
  gaps: BackgroundGap[] = [];

  get state(): RecorderState {
    if (!this.media || this.media.state === 'inactive') return 'idle';
    return this.media.state === 'paused' ? 'paused' : 'recording';
  }

  get elapsedSec(): number {
    const running = this.clockRunning ? performance.now() - this.runningSince : 0;
    return (this.accumulatedMs + running) / 1000;
  }

  get activeSessionId(): string | undefined {
    return this.stream === null ? undefined : this.sessionId;
  }

  /** Current input loudness, 0..1, for the level meter. */
  level(): number {
    if (!this.analyser || !this.samples || this.state !== 'recording') return 0;
    this.analyser.getByteTimeDomainData(this.samples);
    let sum = 0;
    for (const v of this.samples) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / this.samples.length) * 4);
  }

  get mimeType(): string {
    return this.media?.mimeType ?? '';
  }

  async start(speakerCount?: number): Promise<void> {
    if (this.stream) throw new UserError('Bitte die bisherige Aufnahme zuerst speichern oder verwerfen.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // No mimeType option: the browser picks what it supports (iOS: audio/mp4, Chrome: audio/webm).
    try {
      this.media = new MediaRecorder(this.stream);
    } catch (e) {
      this.cleanup();
      throw e;
    }
    this.sessionId = crypto.randomUUID();
    this.seq = 0;
    this.startedAt = Date.now();
    this.accumulatedMs = 0;
    this.runningSince = performance.now();
    this.clockRunning = true;
    this.media.addEventListener('stop', () => {
      if (this.clockRunning) this.accumulatedMs += performance.now() - this.runningSince;
      this.clockRunning = false;
    }, { once: true });
    this.speakerCount = speakerCount;
    this.gaps = [];
    this.hiddenSince = null;
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
    try {
      this.media.start(CHUNK_MS);
    } catch (e) {
      this.clockRunning = false;
      this.cleanup();
      throw e;
    }
    this.startLevelMeter(this.stream);
    await this.acquireWakeLock();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  pause(): void {
    if (this.state !== 'recording') return;
    this.media!.pause();
    this.accumulatedMs += performance.now() - this.runningSince;
    this.clockRunning = false;
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.media!.resume();
    this.runningSince = performance.now();
    this.clockRunning = true;
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

  private startLevelMeter(stream: MediaStream) {
    try {
      this.audioContext = new AudioContext();
      if (this.audioContext.state === 'suspended') {
        void this.audioContext.resume();
      }
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.samples = new Uint8Array(this.analyser.fftSize);
      this.audioContext.createMediaStreamSource(stream).connect(this.analyser);
    } catch {
      // The meter is cosmetic; recording works without it.
      this.analyser = null;
    }
  }

  private cleanup() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.analyser = null;
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

  /** True if the system ended the microphone while the app was away (iOS does this in the background). */
  get interrupted(): boolean {
    const track = this.stream?.getAudioTracks()[0];
    return this.stream !== null && (track?.readyState === 'ended' || this.media?.state === 'inactive');
  }

  // iOS pauses web apps in the background; remember when, so the user knows what is missing.
  // The browser also drops the wake lock when the page is hidden; take it again on return.
  private onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (this.state !== 'idle') this.hiddenSince = Date.now();
      return;
    }
    if (this.hiddenSince !== null) {
      this.gaps.push({ from: this.hiddenSince, to: Date.now() });
      this.hiddenSince = null;
    }
    if (this.state !== 'idle') void this.acquireWakeLock();
  };

  /** After the system ended the recording: keep what was saved and turn it into a job. */
  async salvage(): Promise<string> {
    await Promise.all(this.pendingWrites);
    this.pendingWrites = [];
    const sessionId = this.sessionId;
    const durationSec = this.elapsedSec;
    this.cleanup();
    return finalizeSession(sessionId, { durationSec, speakerCount: this.speakerCount });
  }
}

/** The app's one recorder; module-level so a recording survives switching pages. */
export const recorder = new Recorder();

/** Assembles the chunks of a session into one audio job and deletes the chunks, atomically. */
async function finalizeSession(sessionId: string, opts: { durationSec?: number; speakerCount?: number } = {}): Promise<string> {
  const chunks = await db.chunks.where('sessionId').equals(sessionId).sortBy('seq');
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
