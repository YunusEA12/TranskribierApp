// Thin fetch wrapper around the GitHub REST API. The only place in the app that talks to GitHub.

import { base64ToUtf8, utf8ToBase64 } from '../lib/base64Utf8';
import { boundedRequest } from '../lib/request';
import { HttpError, UserError } from '../lib/errors';

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
    return boundedRequest(async (signal) => {
      const res = await fetch(`${API}${path}`, {
        signal,
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
      // Consume the body inside the deadline too; headers alone do not complete a request.
      const body = await res.text();
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    }, 30000, 'GitHub antwortet nicht. Bitte „Erneut versuchen“.');
  }

  private async fail(res: Response, what: string, detail?: string): Promise<never> {
    throw new HttpError('github', res.status, `${what}: HTTP ${res.status} ${detail ?? (await messageOf(res))}`.trim());
  }

  private get repoPath() {
    return `/repos/${this.config.repo}`;
  }

  private get treePath() {
    return `${this.repoPath}/git/trees/${encodeURIComponent(this.config.branch)}?recursive=1`;
  }

  /** Checks Contents write permission, not merely the account owner's repository role. */
  async checkAccess(): Promise<{ canPush: boolean }> {
    const repo = await this.request(this.repoPath);
    if (!repo.ok) await this.fail(repo, 'Repo lesen');
    const data = (await repo.json()) as { permissions?: { push?: boolean } };
    if (data.permissions?.push === false) return { canPush: false };
    const tree = await this.request(this.treePath);
    if (tree.status === 409 && /empty/i.test(await messageOf(tree))) {
      // A new storage repo needs its first commit. Never include credentials or audio.
      await this.putFile('.mitschrift/README.md', '# Mitschrift\n\nGemeinsamer Speicher für Transkripte.\n', 'Initialize transcript storage');
      return { canPush: true };
    }
    if (!tree.ok) await this.fail(tree, 'Speicher-Branch prüfen');
    // A fixed, unreferenced blob checks Contents:write without changing files or the branch.
    const write = await this.request(`${this.repoPath}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: 'Mitschrift storage access check\n', encoding: 'utf-8' }),
    });
    if (!write.ok) await this.fail(write, 'Speicher-Schreibzugriff prüfen');
    return { canPush: true };
  }

  /** All files in the branch. An empty repo (no commit yet) has none. */
  async listTree(): Promise<TreeEntry[]> {
    const res = await this.request(this.treePath);
    if (res.status === 409) {
      const detail = await messageOf(res);
      if (/empty/i.test(detail)) return [];
      await this.fail(res, 'Dateiliste lesen', detail);
    }
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
    const put = (withBranch: boolean) =>
      this.request(`${this.repoPath}/contents/${encodePath(path)}`, {
        method: 'PUT',
        body: JSON.stringify({ message, content: utf8ToBase64(text), ...(withBranch ? { branch: this.config.branch } : {}), ...(sha ? { sha } : {}) }),
      });
    let res = await put(true);
    if (!res.ok) {
      const detail = await messageOf(res);
      // In an empty repo the branch does not exist yet; the first file creates the default branch.
      if (![404, 409, 422].includes(res.status) || !/branch|empty/i.test(detail)) await this.fail(res, 'Datei schreiben', detail);
      const tree = await this.request(this.treePath);
      if (tree.status !== 409 || !/empty/i.test(await messageOf(tree))) await this.fail(res, 'Datei schreiben', detail);
      const repo = await this.request(this.repoPath);
      if (!repo.ok) await this.fail(repo, 'Repo lesen');
      const info = await repo.json() as { default_branch: string };
      if (info.default_branch !== this.config.branch) {
        throw new UserError(`Der Speicher-Branch „${this.config.branch}“ existiert noch nicht. Bitte „${info.default_branch}“ wählen oder den Branch in GitHub anlegen.`);
      }
      res = await put(false);
      if (!res.ok) await this.fail(res, 'Datei schreiben');
    }
    const data = (await res.json()) as { content: { sha: string } };
    return data.content.sha;
  }
}

async function messageOf(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { message?: string }).message ?? '';
  } catch {
    return ''; // Body is not JSON; the status says enough.
  }
}
