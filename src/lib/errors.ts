// Errors shown to the user are short German sentences. Everything else is mapped here.

import { dailyQuotaReset, quotaInfo } from './quota';

/** An error whose message is already meant for the user. */
export class UserError extends Error {}

export class HttpError extends Error {
  constructor(
    readonly service: 'github' | 'gemini',
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function statusOf(e: unknown): number | undefined {
  if (e instanceof HttpError) return e.status;
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === 'number' ? s : undefined;
}

/** The human-readable part of a Google API error, e.g. "API key not valid. Please pass a valid API key." */
export function googleErrorDetail(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return /"message":\s*"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1] ?? raw;
}

/**
 * The connection broke (offline, or iOS suspended the app mid-request). The SDK wraps the browser's
 * TypeError ("Load failed" in Safari, "Failed to fetch" in Chrome), so look at the message too.
 */
export function isNetworkError(e: unknown): boolean {
  const message = e instanceof Error ? `${e.message} ${String((e as { cause?: unknown }).cause ?? '')}` : String(e);
  return /load failed|failed to fetch|networkerror|network connection was lost|internet connection appears to be offline|unexpected http client error|timed out|timeouterror|incomplete json segment/i.test(message);
}

/** What to do about an exhausted Gemini quota: daily ones need a different model or tomorrow morning. */
function quotaMessage(e: unknown): string {
  const info = quotaInfo(e);
  if (info.daily) {
    const now = new Date();
    const reset = dailyQuotaReset(now);
    const day = reset.toDateString() === now.toDateString() ? 'heute' : 'morgen';
    const time = reset.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const model = info.model ? ` für „${info.model}“` : '';
    const limit = info.limit ? ` (${info.limit} Anfragen pro Tag)` : '';
    return `Das kostenlose Tageslimit von Gemini${model} ist aufgebraucht${limit}. Es gilt wieder ab ${day} ${time} Uhr. Sofort weiter geht es mit einem Ersatzmodell: Einstellungen → „Key prüfen“ → beim Ersatzmodell „Übernehmen“, dann „Erneut versuchen“.`;
  }
  return `Gemini meldet zu viele Anfragen auf einmal (${googleErrorDetail(e).slice(0, 100)}). Bitte in ein paar Minuten „Erneut versuchen“.`;
}

export function toUserMessage(e: unknown, service?: 'github' | 'gemini'): string {
  if (e instanceof UserError) return e.message;
  if (isNetworkError(e)) {
    return 'Die Verbindung ist abgerissen, vermutlich weil die App im Hintergrund war oder das Netz weg war. „Erneut versuchen“ macht dort weiter.';
  }
  const svc = e instanceof HttpError ? e.service : service;
  const status = statusOf(e);

  if (svc === 'github') {
    switch (status) {
      case 401:
        return 'GitHub lehnt den Token ab. Bitte Token in den Einstellungen prüfen.';
      case 403:
        return 'Der GitHub-Token darf das Vault-Repo nicht beschreiben (Contents: Read and write nötig) oder das API-Limit ist erreicht.';
      case 404:
        return 'Vault-Repo oder Branch nicht gefunden. Bitte owner/repo, Branch und Token-Zugriff prüfen.';
      case 409:
      case 422:
        return 'Die Datei im Vault wurde gleichzeitig geändert. Bitte erneut versuchen.';
    }
  }
  if (svc === 'gemini') {
    switch (status) {
      case 400: {
        // Google answers an invalid key with 400 INVALID_ARGUMENT, not 401.
        const detail = googleErrorDetail(e);
        if (/API[_ ]key/i.test(detail)) return 'Gemini lehnt den API-Key ab. Bitte den Key neu kopieren und einfügen.';
        return `Gemini hat die Anfrage abgelehnt: ${detail}`;
      }
      case 401:
      case 403:
        return 'Gemini lehnt den API-Key ab. Bitte den Key neu kopieren und einfügen.';
      case 404:
        return 'Das Gemini-Modell wurde nicht gefunden. Bitte Modell-ID in den Einstellungen prüfen.';
      case 429:
        return quotaMessage(e);
    }
  }
  if (status !== undefined && status >= 500) {
    // Google's reason (e.g. "The model is overloaded") tells a passing overload from a lasting problem.
    const reason = `${status}: ${googleErrorDetail(e).slice(0, 120)}`;
    return svc === 'gemini'
      ? `Gemini hat einen Fehler auf Googles Seite gemeldet (${reason}). Die Aufnahme bleibt gespeichert. Bitte in ein paar Minuten „Erneut versuchen“.`
      : `Der Server hat einen Fehler gemeldet (${reason}). Bitte später erneut versuchen.`;
  }
  const detail = e instanceof Error ? e.message : String(e);
  return `Unerwarteter Fehler: ${detail}`;
}
