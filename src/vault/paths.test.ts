import { describe, expect, it } from 'vitest';
import { normalizeBaseDir, parseTranscriptPath, sanitizeTitle, transcriptPath } from './paths';

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

describe('parseTranscriptPath', () => {
  it('reads date, time and title', () => {
    expect(parseTranscriptPath('Transkripte/2026/2026-10-07 0841 Über Öl.md')).toEqual({
      path: 'Transkripte/2026/2026-10-07 0841 Über Öl.md',
      date: '2026-10-07',
      time: '08:41',
      title: 'Über Öl',
    });
  });
  it('drops the collision suffix from the title', () => {
    expect(parseTranscriptPath('Transkripte/2026/2026-10-07 0841 Test (3).md')?.title).toBe('Test');
  });
  it('respects the base folder', () => {
    expect(parseTranscriptPath('yunus/Transkripte/2026/2026-10-07 0841 A.md', 'yunus')?.title).toBe('A');
    expect(parseTranscriptPath('calvin/Transkripte/2026/2026-10-07 0841 A.md', 'yunus')).toBeNull();
  });
  it('ignores other files', () => {
    expect(parseTranscriptPath('README.md')).toBeNull();
    expect(parseTranscriptPath('Transkripte/notiz.md')).toBeNull();
  });
  it('round-trips with transcriptPath', () => {
    const p = transcriptPath('', '2026-10-07', '08:41', 'Ärger: über [Öl]');
    expect(parseTranscriptPath(p)).toMatchObject({ date: '2026-10-07', time: '08:41', title: 'Ärger über Öl' });
  });
});
