// Reading and writing transcripts in the user's vault repo.

import type { HistoryEntry } from '../db/db';
import type { Settings } from '../settings/settingsStore';
import type { TranscriptMeta } from '../types';
import { GithubClient, type RepoFile } from './githubClient';
import { parseTranscriptPath, transcriptPath } from './paths';

const MAX_SUFFIX = 50;

export function clientFromSettings(s: Settings): GithubClient {
  return new GithubClient({ token: s.githubToken.trim(), repo: s.vaultRepo.trim(), branch: s.vaultBranch.trim() || 'main' });
}

/** All transcripts in the vault, newest first. One API call; files are not opened. */
export async function listTranscripts(client: GithubClient, baseDir: string): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];
  for (const item of await client.listTree()) {
    if (item.type !== 'blob') continue;
    const info = parseTranscriptPath(item.path, baseDir);
    if (info) entries.push({ ...info, sha: item.sha });
  }
  return entries.sort((a, b) => (b.date + b.time + b.path).localeCompare(a.date + a.time + a.path));
}

export function readTranscript(client: GithubClient, path: string): Promise<RepoFile | null> {
  return client.getFile(path);
}

/** A path for a new transcript that does not exist yet ("… (2).md" on collisions). */
export async function chooseNewPath(client: GithubClient, baseDir: string, meta: Pick<TranscriptMeta, 'date' | 'time' | 'title'>): Promise<string> {
  for (let n = 1; n <= MAX_SUFFIX; n++) {
    const path = transcriptPath(baseDir, meta.date, meta.time, meta.title, n);
    if (!(await client.getFile(path))) return path;
  }
  throw new Error('Kein freier Dateiname gefunden.');
}

/** Writes the file, overwriting whatever is at `path` (used for our own, already reserved paths). */
export async function writeTranscript(client: GithubClient, path: string, markdown: string, message: string): Promise<string> {
  const existing = await client.getFile(path);
  return client.putFile(path, markdown, message, existing?.sha);
}
