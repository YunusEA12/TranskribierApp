// Settings live only in this browser (localStorage). Keys and tokens never leave the device except
// in requests to Gemini and GitHub.

import { useSyncExternalStore } from 'react';
import { userFolder } from '../vault/paths';

export type EngineId = 'flash' | 'transcribe';

export interface Settings {
  userName: string;
  geminiKey: string;
  sharedVault: string; // name of the Obsidian vault Yunus and Calvin share
  // Optional backup of every transcript into a GitHub repo.
  githubToken: string;
  vaultRepo: string; // "owner/repo"
  vaultBranch: string;
  vaultBaseDir: string; // "" or a folder inside the repo
  engine: EngineId;
  flashModel: string;
  transcribeModel: string;
  fallbackModel: string; // used when the main model's quota is exhausted; "" = none
  removeFillers: boolean;
}

// The only place model ids appear in code (CLAUDE.md rule 5).
export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  geminiKey: '',
  sharedVault: 'Mitschrift',
  githubToken: '',
  vaultRepo: '',
  vaultBranch: 'main',
  vaultBaseDir: '',
  engine: 'flash',
  flashModel: 'gemini-3.8-flash',
  transcribeModel: 'gemini-3.5-transcribe',
  fallbackModel: '',
  removeFillers: true,
};

const STORAGE_KEY = 'mitschrift.settings';
const listeners = new Set<() => void>();
let cached: Settings | null = null;

export function getSettings(): Settings {
  if (cached) return cached;
  let stored: Partial<Settings> = {};
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Settings>;
  } catch {
    // Corrupt or unavailable storage: fall back to defaults.
  }
  cached = { ...DEFAULT_SETTINGS, ...stored };
  if (!cached.sharedVault.trim()) cached.sharedVault = DEFAULT_SETTINGS.sharedVault;
  return cached;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  cached = { ...getSettings(), ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  listeners.forEach((l) => l());
  return cached;
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getSettings,
  );
}

export const MISSING_KEY = 'Gemini-API-Key';
export const MISSING_NAME = 'Wer bist du?';

/** What is still missing before recordings are processed: the key, and who records (decides the vault folder). */
export function missingSettings(s: Settings): string[] {
  const missing: string[] = [];
  if (!s.geminiKey.trim()) missing.push(MISSING_KEY);
  if (!userFolder(s.userName)) missing.push(MISSING_NAME);
  return missing;
}

export function githubBackupEnabled(s: Settings): boolean {
  return Boolean(s.githubToken.trim() && /^[\w.-]+\/[\w.-]+$/.test(s.vaultRepo.trim()));
}
