// File names follow PLAN.md 4.2: "YYYY-MM-DD HHmm <Titel>.md" under Transkripte/YYYY/.

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

/** date "YYYY-MM-DD", time "HH:MM". `suffix` > 1 appends " (n)" to avoid collisions. */
export function transcriptPath(baseDir: string, date: string, time: string, title: string, suffix = 1): string {
  const year = date.slice(0, 4);
  const name = `${date} ${time.replace(':', '')} ${sanitizeTitle(title)}${suffix > 1 ? ` (${suffix})` : ''}.md`;
  return `${normalizeBaseDir(baseDir)}${TRANSCRIPTS_DIR}/${year}/${name}`;
}

export interface TranscriptFileInfo {
  path: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
}

const FILE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2})(\d{2}) (.+)\.md$/;

/** Reads date, time and title from a path in the vault; null for files that don't follow the naming scheme. */
export function parseTranscriptPath(path: string, baseDir = ''): TranscriptFileInfo | null {
  const prefix = `${normalizeBaseDir(baseDir)}${TRANSCRIPTS_DIR}/`;
  if (!path.startsWith(prefix)) return null;
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const m = FILE_RE.exec(fileName);
  if (!m) return null;
  const [, date, hh, mm, rest] = m as unknown as [string, string, string, string, string];
  return { path, date, time: `${hh}:${mm}`, title: rest.replace(/ \(\d+\)$/, '') };
}
