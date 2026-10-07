import { describe, expect, it } from 'vitest';
import { MAX_INLINE_URI_LENGTH, obsidianNewNote } from './obsidian';

describe('obsidianNewNote', () => {
  it('builds a new-note URI with vault, file without extension and content', () => {
    const { uri, needsClipboard } = obsidianNewNote('Unser Vault', 'Transkripte/2026/2026-10-07 0841 Über Öl.md', '# Titel\n\nText & mehr');
    expect(needsClipboard).toBe(false);
    expect(uri).toBe(
      'obsidian://new?vault=Unser%20Vault&file=Transkripte%2F2026%2F2026-10-07%200841%20%C3%9Cber%20%C3%96l&overwrite=true&content=%23%20Titel%0A%0AText%20%26%20mehr',
    );
  });

  it('decodes back to the original values', () => {
    const md = '---\ntitle: "A?B=C"\n---\n\n**[00:00] Sprecher 1:** 100% #tag';
    const url = new URL(obsidianNewNote('v', 'Transkripte/2026/x.md', md).uri.replace('obsidian://new', 'https://x/new'));
    expect(url.searchParams.get('content')).toBe(md);
    expect(url.searchParams.get('file')).toBe('Transkripte/2026/x');
  });

  it('switches to the clipboard for long transcripts', () => {
    const { uri, needsClipboard } = obsidianNewNote('v', 'a.md', 'x'.repeat(MAX_INLINE_URI_LENGTH));
    expect(needsClipboard).toBe(true);
    expect(uri).toBe('obsidian://new?vault=v&file=a&overwrite=true&clipboard=true');
  });
});
