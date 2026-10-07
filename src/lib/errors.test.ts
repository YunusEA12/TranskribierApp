import { describe, expect, it } from 'vitest';
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
