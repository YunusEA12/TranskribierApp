import { describe, expect, it } from 'vitest';
import { suggestFlashModel } from './connectionTest';

const models = [
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-3.8-flash-lite',
  'gemini-3.10-flash-preview',
  'gemini-3.8-flash-image',
  'gemini-3.8-pro',
];

describe('suggestFlashModel', () => {
  it('picks the newest stable flash model', () => {
    expect(suggestFlashModel(models)).toBe('gemini-3.8-flash');
  });
  it('picks a lite model for the fallback', () => {
    expect(suggestFlashModel(models, true)).toBe('gemini-3.8-flash-lite');
  });
  it('uses previews only when nothing stable exists', () => {
    expect(suggestFlashModel(['gemini-4.0-flash-preview'])).toBe('gemini-4.0-flash-preview');
    expect(suggestFlashModel(['gemini-3.8-pro'])).toBeUndefined();
  });
});
