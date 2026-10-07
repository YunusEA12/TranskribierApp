import { describe, expect, it } from 'vitest';
import { normalizeBaseDir, sanitizeTitle, transcriptPath } from './paths';

describe('sanitizeTitle', () => {
  it('removes forbidden characters and collapses whitespace', () => {
    expect(sanitizeTitle('  Plan: A/B [Test] #1 ^x | "y"?  ')).toBe('Plan AB Test 1 x y');
  });
  it('keeps umlauts', () => {
    expect(sanitizeTitle('Größe ändern über Öl')).toBe('Größe ändern über Öl');
  });
  it('falls back when nothing is left', () => {
    expect(sanitizeTitle('???')).toBe('Transkript');
    expect(sanitizeTitle('')).toBe('Transkript');
  });
  it('strips leading dots so no hidden files are created', () => {
    expect(sanitizeTitle('...geheim')).toBe('geheim');
  });
  it('limits the length', () => {
    expect(sanitizeTitle('a'.repeat(200)).length).toBe(80);
  });
});

describe('transcriptPath', () => {
  it('builds the path from PLAN.md 4.2', () => {
    expect(transcriptPath('', '2026-10-07', '08:41', 'Projektplanung Transkript-App')).toBe(
      'Transkripte/2026/2026-10-07 0841 Projektplanung Transkript-App.md',
    );
  });
  it('supports a base folder and collision suffix', () => {
    expect(transcriptPath('/calvin/', '2026-01-02', '23:05', 'Test', 2)).toBe('calvin/Transkripte/2026/2026-01-02 2305 Test (2).md');
  });
});

describe('normalizeBaseDir', () => {
  it('normalizes slashes', () => {
    expect(normalizeBaseDir('')).toBe('');
    expect(normalizeBaseDir(' / ')).toBe('');
    expect(normalizeBaseDir('a/b/')).toBe('a/b/');
  });
});
