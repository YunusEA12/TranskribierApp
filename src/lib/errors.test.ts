import { describe, expect, it, vi } from 'vitest';
import { HttpError, googleErrorDetail, isNetworkError, toUserMessage } from './errors';

const googleBody = (message: string, status: string) =>
  `got status: 400 Bad Request. {"error":{"code":400,"message":"${message}","status":"${status}"}}`;

describe('toUserMessage', () => {
  it('recognizes an invalid Gemini key behind HTTP 400', () => {
    const e = new HttpError('gemini', 400, googleBody('API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT'));
    expect(toUserMessage(e)).toMatch(/API-Key/);
  });

  it('shows Google\'s own reason for other 400 errors', () => {
    const e = new HttpError('gemini', 400, googleBody('Unsupported MIME type: audio/xyz', 'INVALID_ARGUMENT'));
    expect(toUserMessage(e)).toBe('Gemini hat die Anfrage abgelehnt: Unsupported MIME type: audio/xyz');
  });

  it('names Google\'s reason for server errors', () => {
    const e = new HttpError('gemini', 503, 'got status: 503 Service Unavailable. {"error":{"code":503,"message":"The model is overloaded. Please try again later.","status":"UNAVAILABLE"}}');
    expect(toUserMessage(e)).toBe(
      'Gemini hat einen Fehler auf Googles Seite gemeldet (503: The model is overloaded. Please try again later.). Die Aufnahme bleibt gespeichert. Bitte in ein paar Minuten „Erneut versuchen“.',
    );
  });

  it('says when a used-up daily quota is back, and how to go on now', () => {
    vi.useFakeTimers({ now: new Date('2026-10-08T08:44:00Z') });
    try {
      const body = JSON.stringify({ error: { code: 429, details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaDimensions: { model: 'gemini-x' }, quotaValue: '20' }] }] } });
      const message = toUserMessage(new HttpError('gemini', 429, body));
      const reset = new Date('2026-10-09T07:00:00Z').toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      expect(message).toContain('Tageslimit von Gemini für „gemini-x“ ist aufgebraucht (20 Anfragen pro Tag)');
      expect(message).toContain(`ab morgen ${reset} Uhr`);
      expect(message).toContain('Ersatzmodell');
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps GitHub statuses', () => {
    expect(toUserMessage(new HttpError('github', 401, 'x'))).toMatch(/Token/);
    expect(toUserMessage(new HttpError('github', 404, 'x'))).toMatch(/nicht gefunden/);
  });

  it('recognizes network errors', () => {
    expect(toUserMessage(new TypeError('Failed to fetch'))).toMatch(/Verbindung ist abgerissen/);
  });

  it('recognizes Safari dropping a request of a suspended app, as wrapped by the SDK', () => {
    const e = new Error('Unexpected HTTP client error: TypeError: Load failed');
    expect(isNetworkError(e)).toBe(true);
    expect(toUserMessage(e, 'gemini')).toMatch(/Erneut versuchen/);
  });
});

describe('googleErrorDetail', () => {
  it('falls back to the raw message', () => {
    expect(googleErrorDetail(new Error('plain'))).toBe('plain');
  });
});
