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
