// Invite: Yunus' app shows the connection to the shared storage as a QR code; Calvin's app scans it.
// The code holds the token, so it is only shown on screen and never stored or sent anywhere.

import { REPO_RE } from './settingsStore';

const PREFIX = 'MITSCHRIFT1:';

export interface Invite {
  repo: string;
  branch: string;
  token: string;
  geminiKey?: string;
  geminiFallbackKeys?: string;
}

const toBase64Url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeInvite(invite: Invite): string {
  return (
    PREFIX +
    toBase64Url(
      JSON.stringify({
        r: invite.repo,
        b: invite.branch,
        t: invite.token,
        ...(invite.geminiKey ? { k: invite.geminiKey } : {}),
        ...(invite.geminiFallbackKeys ? { fk: invite.geminiFallbackKeys } : {}),
      }),
    )
  );
}

/** Returns null for anything that is not a valid invite. */
export function decodeInvite(text: string): Invite | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  try {
    const data = JSON.parse(fromBase64Url(trimmed.slice(PREFIX.length))) as {
      r?: unknown;
      b?: unknown;
      t?: unknown;
      k?: unknown;
      fk?: unknown;
    };
    if (typeof data.r !== 'string' || !REPO_RE.test(data.r) || typeof data.t !== 'string' || !data.t) return null;
    return {
      repo: data.r,
      branch: typeof data.b === 'string' && data.b ? data.b : 'main',
      token: data.t,
      ...(typeof data.k === 'string' && data.k ? { geminiKey: data.k } : {}),
      ...(typeof data.fk === 'string' && data.fk ? { geminiFallbackKeys: data.fk } : {}),
    };
  } catch {
    return null;
  }
}

