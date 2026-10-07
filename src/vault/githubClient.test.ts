import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubClient } from './githubClient';

const client = (branch = 'main') => new GithubClient({ token: 'test-token', repo: 'owner/storage', branch });
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => vi.unstubAllGlobals());

describe('storage permissions and branch selection', () => {
  it('rejects a read-only token even when the account owner has push rights', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ permissions: { push: true } }))
      .mockResolvedValueOnce(response({ tree: [] }))
      .mockResolvedValueOnce(response({ message: 'Resource not accessible by integration' }, 403));
    vi.stubGlobal('fetch', fetch);
    await expect(client().checkAccess()).rejects.toMatchObject({ status: 403 });
  });

  it('checks write access without committing test files to an existing branch', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ permissions: { push: true } }))
      .mockResolvedValueOnce(response({ tree: [] }))
      .mockResolvedValueOnce(response({ sha: 'probe' }, 201));
    vi.stubGlobal('fetch', fetch);
    await expect(client().checkAccess()).resolves.toEqual({ canPush: true });
    expect(fetch.mock.calls[2]?.[0]).toBe('https://api.github.com/repos/owner/storage/git/blobs');
    expect(fetch.mock.calls.filter(([, init]) => init.method === 'PUT')).toHaveLength(0);
  });

  it('does not show a nonexistent branch as an empty history', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ message: 'Not Found' }, 404)));
    await expect(client('typo').listTree()).rejects.toMatchObject({ status: 404 });
  });

  it('does not retry a branch protection failure on the default branch', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ message: 'Protected branch update failed' }, 403));
    vi.stubGlobal('fetch', fetch);
    await expect(client('protected').putFile('file.md', 'text', 'save')).rejects.toMatchObject({ status: 403 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not silently save to main when a configured branch is misspelled', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ message: 'Branch typo not found' }, 422))
      .mockResolvedValueOnce(response({ message: 'Not Found' }, 404));
    vi.stubGlobal('fetch', fetch);
    await expect(client('typo').putFile('file.md', 'text', 'save')).rejects.toMatchObject({ status: 422 });
    expect(fetch.mock.calls.filter(([, init]) => init.method === 'PUT')).toHaveLength(1);
  });

  it('initializes a genuinely empty repo on its configured default branch', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ permissions: { push: true } }))
      .mockResolvedValueOnce(response({ message: 'Git Repository is empty.' }, 409))
      .mockResolvedValueOnce(response({ message: 'Branch main not found' }, 422))
      .mockResolvedValueOnce(response({ message: 'Git Repository is empty.' }, 409))
      .mockResolvedValueOnce(response({ default_branch: 'main' }))
      .mockResolvedValueOnce(response({ content: { sha: 'initial' } }, 201));
    vi.stubGlobal('fetch', fetch);
    await expect(client().checkAccess()).resolves.toEqual({ canPush: true });
    expect(JSON.parse(fetch.mock.calls[5]?.[1].body)).not.toHaveProperty('branch');
  });
});
