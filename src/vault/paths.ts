// File names follow PLAN.md 4.2: "YYYY-MM-DD HHmm <Titel>.md" under Transkripte/<Name>/YYYY/.
// The name folder keeps each person's notes apart in a shared vault; without a name it is left out.

export const TRANSCRIPTS_DIR = 'Transkripte';
const MAX_TITLE_LENGTH = 80;

/** Removes characters that break file names or Obsidian links and collapses whitespace. */
export function sanitizeTitle(title: string): string {
  const cleaned = title
    .replace(/[/\\:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  const cut = cleaned.length > MAX_TITLE_LENGTH ? cleaned.slice(0, MAX_TITLE_LENGTH).trimEnd() : cleaned;
  return cut || 'Transkript';
}

/** Normalizes a configured base folder to "" or "folder/". */
export function normalizeBaseDir(baseDir: string): string {
  const trimmed = baseDir.trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `${trimmed}/` : '';
}

/** Folder name for a person, or "" if no usable name is set. */
export function userFolder(name: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return cleaned.slice(0, 40).trimEnd();
}

/** Vault-relative path. date "YYYY-MM-DD", time "HH:MM"; `suffix` > 1 appends " (n)" to avoid collisions. */
export function transcriptPath(date: string, time: string, title: string, opts: { user?: string; suffix?: number } = {}): string {
  const year = date.slice(0, 4);
  const suffix = opts.suffix ?? 1;
  const person = userFolder(opts.user ?? '');
  const name = `${date} ${time.replace(':', '')} ${sanitizeTitle(title)}${suffix > 1 ? ` (${suffix})` : ''}.md`;
  return `${TRANSCRIPTS_DIR}/${person ? `${person}/` : ''}${year}/${name}`;
}

export interface TranscriptFileInfo {
  path: string;
  user: string; // folder name, "" for files without a person folder
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
}

const FILE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2})(\d{2}) (.+)\.md$/;

/** Reads person, date, time and title from a path like "Transkripte/Yunus/2026/2026-10-07 0841 Titel.md". */
export function parseTranscriptPath(path: string): TranscriptFileInfo | null {
  const parts = path.split('/');
  if (parts[0] !== TRANSCRIPTS_DIR || (parts.length !== 3 && parts.length !== 4)) return null;
  const m = FILE_RE.exec(parts[parts.length - 1]!);
  if (!m) return null;
  const [, date, hh, mm, rest] = m as unknown as [string, string, string, string, string];
  return { path, user: parts.length === 4 ? parts[1]! : '', date, time: `${hh}:${mm}`, title: rest.replace(/ \(\d+\)$/, '') };
}
