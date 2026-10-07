// Thin fetch wrapper around the GitHub REST API. The only place in the app that talks to GitHub.

import { base64ToUtf8, utf8ToBase64 } from '../lib/base64Utf8';
import { HttpError } from '../lib/errors';

const API = 'https://api.github.com';

export interface TreeEntry {
  path: string;
  sha: string;
  type: 'blob' | 'tree' | 'commit';
}

export interface RepoFile {
  sha: string;
  text: string;
}

export interface GithubConfig {
  token: string;
  repo: string; // owner/repo
  branch: string;
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export class GithubClient {
  constructor(private readonly config: GithubConfig) {}

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    return res;
  }

  private async fail(res: Response, what: string): Promise<never> {
    let detail = '';
    try {
      detail = ((await res.json()) as { message?: string }).message ?? '';
    } catch {
      // Body is not JSON; the status says enough.
    }
    throw new HttpError('github', res.status, `${what}: HTTP ${res.status} ${detail}`.trim());
  }

  private get repoPath() {
    return `/repos/${this.config.repo}`;
  }

  /** Checks token, repo and branch; returns whether the token may write. */
  async checkAccess(): Promise<{ canPush: boolean }> {
    const repo = await this.request(this.repoPath);
    if (!repo.ok) await this.fail(repo, 'Repo lesen');
    const data = (await repo.json()) as { permissions?: { push?: boolean } };
    const branch = await this.request(`${this.repoPath}/branches/${encodeURIComponent(this.config.branch)}`);
    if (!branch.ok) await this.fail(branch, 'Branch lesen');
    return { canPush: data.permissions?.push ?? false };
  }

  async listTree(): Promise<TreeEntry[]> {
    const res = await this.request(`${this.repoPath}/git/trees/${encodeURIComponent(this.config.branch)}?recursive=1`);
    if (!res.ok) await this.fail(res, 'Dateiliste lesen');
    const data = (await res.json()) as { tree: TreeEntry[]; truncated?: boolean };
    if (data.truncated) console.warn('GitHub tree listing was truncated');
    return data.tree;
  }

  /** Returns null if the file does not exist. */
  async getFile(path: string): Promise<RepoFile | null> {
    const res = await this.request(`${this.repoPath}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.config.branch)}`);
    if (res.status === 404) return null;
    if (!res.ok) await this.fail(res, 'Datei lesen');
    const data = (await res.json()) as { sha: string; content?: string; encoding?: string };
    if (data.encoding === 'base64' && data.content !== undefined) return { sha: data.sha, text: base64ToUtf8(data.content) };
    // Files over 1 MB come without content; fetch the blob instead.
    const blob = await this.request(`${this.repoPath}/git/blobs/${data.sha}`);
    if (!blob.ok) await this.fail(blob, 'Datei lesen');
    const blobData = (await blob.json()) as { content: string };
    return { sha: data.sha, text: base64ToUtf8(blobData.content) };
  }

  /** Creates the file, or updates it when `sha` of the current version is given. Returns the new sha. */
  async putFile(path: string, text: string, message: string, sha?: string): Promise<string> {
    const res = await this.request(`${this.repoPath}/contents/${encodePath(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: utf8ToBase64(text), branch: this.config.branch, ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) await this.fail(res, 'Datei schreiben');
    const data = (await res.json()) as { content: { sha: string } };
    return data.content.sha;
  }
}
