// IndexedDB: audio (never leaves the device except for the Gemini upload), jobs, recording chunks
// for crash recovery, transcripts made on this device, and a cache of the shared storage.

import Dexie, { type EntityTable } from 'dexie';
import type { Job } from '../jobs/queue';
import type { RemoteEntry } from '../vault/vaultRepo';

export interface AudioRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

/** A piece of an ongoing recording, written every few seconds. */
export interface RecordingChunk {
  id?: number;
  sessionId: string;
  seq: number;
  blob: Blob;
  mimeType: string;
  startedAt: number;
  elapsedSec: number;
}

/** A finished transcript. `markdown` is exactly what goes into the vault. */
export interface TranscriptRecord {
  id: string; // same as the job id
  path: string; // vault-relative, e.g. "Transkripte/2026/2026-10-07 0841 Titel.md"
  title: string;
  date: string;
  time: string;
  durationMin: number;
  speakerCount: number;
  markdown: string;
  createdAt: number;
  githubPath?: string; // set once the transcript is in the shared storage
}

export interface RemoteFile {
  path: string;
  sha: string;
  text: string;
}

export class MitschriftDb extends Dexie {
  audio!: EntityTable<AudioRecord, 'id'>;
  jobs!: EntityTable<Job, 'id'>;
  chunks!: EntityTable<RecordingChunk, 'id'>;
  transcripts!: EntityTable<TranscriptRecord, 'id'>;
  remote!: EntityTable<RemoteEntry, 'path'>;
  remoteFiles!: EntityTable<RemoteFile, 'path'>;

  constructor() {
    super('mitschrift');
    this.version(1).stores({
      audio: 'id',
      jobs: 'id, status, recordedAt',
      chunks: '++id, sessionId, [sessionId+seq]',
      history: 'path, date',
      files: 'path',
    });
    // v2: transcripts are kept on the device; the old history cache is gone.
    this.version(2).stores({
      transcripts: 'id, path, createdAt',
      history: null,
      files: null,
    });
    // v3: the shared storage (GitHub repo) is the common history of both users.
    this.version(3).stores({
      remote: 'path, date, user',
      remoteFiles: 'path',
    });
  }
}

export const db = new MitschriftDb();

/** Ask the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Not supported; nothing to do.
  }
}
