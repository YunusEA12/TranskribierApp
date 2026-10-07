// Keeps the installed app current without reinstalling it. A new version is downloaded in the
// background; it is switched to only when nothing would be lost (never during a recording).

import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

export const APP_VERSION = __APP_VERSION__;
export const BUILD_TIME = __BUILD_TIME__;

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** Right after opening the app nothing is in progress, so an update can be applied without asking. */
const QUIET_START_MS = 15000;

let updateReady = false;
let registration: ServiceWorkerRegistration | undefined;
let apply: (() => Promise<void>) | null = null;
let isIdle: () => boolean = () => true;
const startedAt = Date.now();
const listeners = new Set<() => void>();

function setUpdateReady(value: boolean) {
  updateReady = value;
  listeners.forEach((l) => l());
}

export function startUpdates(options: { isIdle: () => boolean }): void {
  isIdle = options.isIdle;
  apply = registerSW({
    immediate: true,
    onNeedRefresh() {
      setUpdateReady(true);
      if (isIdle() && Date.now() - startedAt < QUIET_START_MS) installUpdate();
    },
    onRegisteredSW(_url, reg) {
      registration = reg;
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
    // Leaving the app is a good moment to switch, unless a recording is running.
    else if (updateReady && isIdle()) installUpdate();
  });
  setInterval(() => void checkForUpdate(), CHECK_INTERVAL_MS);
}

export function installUpdate(): void {
  void apply?.();
}

/** Asks the server for a new version. */
export async function checkForUpdate(): Promise<'available' | 'current' | 'unsupported'> {
  if (!registration) return 'unsupported';
  try {
    await registration.update();
  } catch {
    return 'current';
  }
  return updateReady || registration.installing || registration.waiting ? 'available' : 'current';
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => updateReady,
  );
}
