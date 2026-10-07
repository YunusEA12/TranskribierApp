// Minimal hash routing; GitHub Pages has no server-side rewrites.

import { useSyncExternalStore } from 'react';

export type Route =
  | { page: 'record' }
  | { page: 'history' }
  | { page: 'settings' }
  | { page: 'transcript'; path: string };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'history') return { page: 'history' };
  if (h === 'settings') return { page: 'settings' };
  if (h.startsWith('t/')) return { page: 'transcript', path: decodeURIComponent(h.slice(2)) };
  return { page: 'record' };
}

export const hrefFor = {
  record: '#/',
  history: '#/history',
  settings: '#/settings',
  transcript: (path: string) => `#/t/${encodeURIComponent(path)}`,
};

export function navigate(href: string): void {
  window.location.hash = href;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l);
      return () => window.removeEventListener('hashchange', l);
    },
    () => window.location.hash,
  );
  return parseHash(hash);
}
