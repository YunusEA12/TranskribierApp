// Settings live only in this browser (localStorage). Keys and tokens never leave the device except
// in requests to Gemini and GitHub.

import { useSyncExternalStore } from 'react';
import { userFolder } from '../vault/paths';

export type EngineId = 'flash' | 'transcribe';

export interface Settings {
  userName: string;
  geminiKey: string;
  // Shared storage: a private GitHub repo both phones write to. Yunus creates the token; Calvin gets
  // repo and token by scanning an invite QR code in Yunus' app.
  githubToken: string;
  vaultRepo: string; // "owner/repo"
  vaultBranch: string;
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
  githubToken: '',
  vaultRepo: 'YunusEA12/mitschrift-daten',
  vaultBranch: 'main',
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
  if (!cached.vaultRepo.trim()) cached.vaultRepo = DEFAULT_SETTINGS.vaultRepo;
  if (!cached.vaultBranch.trim()) cached.vaultBranch = DEFAULT_SETTINGS.vaultBranch;
  // "-agent" variants cannot take audio; an earlier suggestion could have picked one.
  cached.flashModel = cached.flashModel.replace(/-agent$/, '');
  cached.fallbackModel = cached.fallbackModel.replace(/-agent$/, '');
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
export const MISSING_STORAGE = 'Gemeinsamer Speicher';

export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function storageConnected(s: Settings): boolean {
  return Boolean(s.githubToken.trim() && REPO_RE.test(s.vaultRepo.trim()));
}

/** What is still missing before recordings are processed: key, who records (decides the folder), and the shared storage. */
export function missingSettings(s: Settings): string[] {
  const missing: string[] = [];
  if (!s.geminiKey.trim()) missing.push(MISSING_KEY);
  if (!userFolder(s.userName)) missing.push(MISSING_NAME);
  if (!storageConnected(s)) missing.push(MISSING_STORAGE);
  return missing;
}
