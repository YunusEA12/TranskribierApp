import { describe, expect, it, vi } from 'vitest';
import type { GithubClient } from './githubClient';
import { saveTranscript, TranscriptCollisionError } from './vaultRepo';

describe('transcript writes', () => {
  it('never overwrites a different remote transcript', async () => {
    const putFile = vi.fn();
    const client = { getFile: async () => ({ sha: 'old', text: 'other recording' }), putFile } as unknown as GithubClient;
    await expect(saveTranscript(client, 'a.md', 'new recording', 'Titel')).rejects.toBeInstanceOf(TranscriptCollisionError);
    expect(putFile).not.toHaveBeenCalled();
  });
  it('recognizes a successful earlier upload after its response was lost', async () => {
    const putFile = vi.fn();
    const client = { getFile: async () => ({ sha: 'old', text: 'same recording' }), putFile } as unknown as GithubClient;
    await expect(saveTranscript(client, 'a.md', 'same recording', 'Titel')).resolves.toBe('old');
    expect(putFile).not.toHaveBeenCalled();
  });
});
