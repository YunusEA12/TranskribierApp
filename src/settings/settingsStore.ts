// Settings live only in this browser (localStorage). Keys and tokens never leave the device except
// in requests to Gemini and GitHub.

import { useSyncExternalStore } from 'react';

export type EngineId = 'flash' | 'transcribe';

export interface Settings {
  userName: string;
  geminiKey: string;
  githubToken: string;
  vaultRepo: string; // "owner/repo"
  vaultBranch: string;
  vaultBaseDir: string; // "" or a folder for a shared vault
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

/** What is still missing before a recording can be transcribed and saved. */
export function missingSettings(s: Settings): string[] {
  const missing: string[] = [];
  if (!s.userName.trim()) missing.push('Name');
  if (!s.geminiKey.trim()) missing.push('Gemini-API-Key');
  if (!s.githubToken.trim()) missing.push('GitHub-Token');
  if (!/^[\w.-]+\/[\w.-]+$/.test(s.vaultRepo.trim())) missing.push('Vault-Repo (owner/repo)');
  return missing;
}
