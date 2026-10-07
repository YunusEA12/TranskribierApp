import { describe, expect, it } from 'vitest';
import { normalizeBaseDir, sanitizeTitle, transcriptPath, userFolder } from './paths';

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
  it('builds the path from PLAN.md 4.2 with a folder per person', () => {
    expect(transcriptPath('2026-10-07', '08:41', 'Projektplanung Transkript-App', { user: 'Yunus' })).toBe(
      'Transkripte/Yunus/2026/2026-10-07 0841 Projektplanung Transkript-App.md',
    );
  });
  it('leaves the person folder out when no name is set', () => {
    expect(transcriptPath('2026-01-02', '23:05', 'Test', { user: '  ', suffix: 2 })).toBe('Transkripte/2026/2026-01-02 2305 Test (2).md');
  });
  it('keeps names from escaping their folder', () => {
    expect(transcriptPath('2026-01-02', '23:05', 'Test', { user: '../Calvin/x' })).toBe('Transkripte/Calvinx/2026/2026-01-02 2305 Test.md');
  });
});

describe('normalizeBaseDir', () => {
  it('normalizes slashes', () => {
    expect(normalizeBaseDir('')).toBe('');
    expect(normalizeBaseDir(' / ')).toBe('');
    expect(normalizeBaseDir('a/b/')).toBe('a/b/');
  });
});

describe('userFolder', () => {
  it('keeps umlauts and spaces, drops path characters', () => {
    expect(userFolder(' Jörg  M. ')).toBe('Jörg M.');
    expect(userFolder('a/b\\c')).toBe('abc');
    expect(userFolder('')).toBe('');
  });
});
