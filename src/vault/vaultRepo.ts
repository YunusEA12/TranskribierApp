// The shared storage: a private GitHub repo with one Markdown file per transcript (format: PLAN.md 4.3).

import { UserError } from '../lib/errors';
import type { Settings } from '../settings/settingsStore';
import { GithubClient, type RepoFile } from './githubClient';
import { parseTranscriptPath, type TranscriptFileInfo } from './paths';

export function clientFromSettings(s: Settings): GithubClient {
  return new GithubClient({ token: s.githubToken.trim(), repo: s.vaultRepo.trim(), branch: s.vaultBranch.trim() || 'main' });
}

export interface RemoteEntry extends TranscriptFileInfo {
  sha: string;
}

/** All transcripts in the shared storage, newest first. One API call; files are not opened. */
export async function listTranscripts(client: GithubClient): Promise<RemoteEntry[]> {
  const entries: RemoteEntry[] = [];
  for (const item of await client.listTree()) {
    if (item.type !== 'blob') continue;
    const info = parseTranscriptPath(item.path);
    if (info) entries.push({ ...info, sha: item.sha });
  }
  return entries.sort((a, b) => (b.date + b.time + b.path).localeCompare(a.date + a.time + a.path));
}

export function readTranscript(client: GithubClient, path: string): Promise<RepoFile | null> {
  return client.getFile(path);
}

/** Creates a transcript or confirms an identical earlier upload; never overwrites different content. */
export async function saveTranscript(client: GithubClient, path: string, markdown: string, title: string): Promise<string> {
  const existing = await client.getFile(path);
  if (existing) {
    if (existing.text === markdown) return existing.sha;
    throw new TranscriptCollisionError('Unter diesem Dateinamen liegt bereits ein anderes Transkript.');
  }
  return client.putFile(path, markdown, `Add transcript: ${title}`);
}

export class TranscriptCollisionError extends UserError {}
