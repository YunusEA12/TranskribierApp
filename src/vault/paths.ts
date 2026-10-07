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
