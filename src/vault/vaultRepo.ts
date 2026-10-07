// Optional backup of transcripts into a GitHub repo (e.g. for AI analysis). Not needed for Obsidian.

import type { Settings } from '../settings/settingsStore';
import { GithubClient } from './githubClient';
import { normalizeBaseDir } from './paths';

export function clientFromSettings(s: Settings): GithubClient {
  return new GithubClient({ token: s.githubToken.trim(), repo: s.vaultRepo.trim(), branch: s.vaultBranch.trim() || 'main' });
}

/** Writes the transcript to `<baseDir>/<path>`, overwriting our own earlier copy. Returns the repo path. */
export async function backupTranscript(client: GithubClient, baseDir: string, path: string, markdown: string, title: string): Promise<string> {
  const repoPath = `${normalizeBaseDir(baseDir)}${path}`;
  const existing = await client.getFile(repoPath);
  await client.putFile(repoPath, markdown, `Add transcript: ${title}`, existing?.sha);
  return repoPath;
}
