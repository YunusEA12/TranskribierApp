// IndexedDB: audio (never leaves the device except for the Gemini upload), jobs, recording chunks
// for crash recovery, and a cache of the vault history.

import Dexie, { type EntityTable } from 'dexie';
import type { Job } from '../jobs/queue';

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

export interface HistoryEntry {
  path: string;
  sha: string;
  date: string;
  time: string;
  title: string;
}

export interface CachedFile {
  path: string;
  sha: string;
  text: string;
}

export class MitschriftDb extends Dexie {
  audio!: EntityTable<AudioRecord, 'id'>;
  jobs!: EntityTable<Job, 'id'>;
  chunks!: EntityTable<RecordingChunk, 'id'>;
  history!: EntityTable<HistoryEntry, 'path'>;
  files!: EntityTable<CachedFile, 'path'>;

  constructor() {
    super('mitschrift');
    this.version(1).stores({
      audio: 'id',
      jobs: 'id, status, recordedAt',
      chunks: '++id, sessionId, [sessionId+seq]',
      history: 'path, date',
      files: 'path',
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
