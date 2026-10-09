import { describe, expect, it } from 'vitest';
import { suggestFallbackModel, suggestFlashModel } from './connectionTest';

const models = [
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-3.8-flash-lite',
  'gemini-3.10-flash-preview',
  'gemini-3.8-flash-image',
  'gemini-3.8-flash-agent',
  'gemini-3.8-pro',
];

describe('suggestFlashModel', () => {
  it('picks the newest stable flash model', () => {
    expect(suggestFlashModel(models)).toBe('gemini-3.8-flash');
  });
  it('picks a lite model for the fallback', () => {
    expect(suggestFlashModel(models, true)).toBe('gemini-3.8-flash-lite');
  });
  it('never suggests agent variants, which cannot take audio', () => {
    expect(suggestFlashModel(['gemini-3.8-flash-agent', 'gemini-3.8-flash-preview-09'])).toBe('gemini-3.8-flash-preview-09');
  });

  it('uses previews only when nothing stable exists', () => {
    expect(suggestFlashModel(['gemini-4.0-flash-preview'])).toBe('gemini-4.0-flash-preview');
    expect(suggestFlashModel(['gemini-3.8-pro'])).toBeUndefined();
  });
});

describe('suggestFallbackModel', () => {
  it('prefers a lite model, which has its own daily quota', () => {
    expect(suggestFallbackModel(models, 'gemini-3.8-flash')).toBe('gemini-3.8-flash-lite');
  });
  it('takes another flash model if there is no lite one', () => {
    expect(suggestFallbackModel(['gemini-2.5-flash', 'gemini-3.8-flash'], 'gemini-3.8-flash')).toBe('gemini-2.5-flash');
  });
  it('suggests nothing if the main model is the only one', () => {
    expect(suggestFallbackModel(['gemini-3.8-flash'], 'gemini-3.8-flash')).toBeUndefined();
  });
});

describe('allGeminiKeys and parseKeyList', () => {
  it('parses comma-, semicolon- and newline-separated keys', async () => {
    const { allGeminiKeys, parseKeyList, DEFAULT_SETTINGS } = await import('./settingsStore');
    expect(parseKeyList('key1, key2\nkey3; key4')).toEqual(['key1', 'key2', 'key3', 'key4']);
    expect(allGeminiKeys({ ...DEFAULT_SETTINGS, geminiKey: 'k1', geminiFallbackKeys: 'k2, k3' })).toEqual(['k1', 'k2', 'k3']);
    expect(allGeminiKeys({ ...DEFAULT_SETTINGS, geminiKey: 'k1', geminiFallbackKeys: 'k1, k2' })).toEqual(['k1', 'k2']);
  });
});

