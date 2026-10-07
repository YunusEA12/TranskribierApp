// Hands a transcript to the Obsidian app on this device via its URI scheme ("obsidian://new").
// Obsidian then writes the note into the vault; syncing the vault between devices is Obsidian's job.

/** Above this URI length the note goes through the clipboard instead of the URI itself. */
export const MAX_INLINE_URI_LENGTH = 30_000;

export interface ObsidianHandoff {
  uri: string;
  /** The markdown must be on the clipboard before opening `uri`. */
  needsClipboard: boolean;
}

/**
 * URI that creates (or overwrites) the note at `path` in `vault`.
 * `path` is vault-relative, e.g. "Transkripte/2026/2026-10-07 0841 Titel.md".
 */
export function obsidianNewNote(vault: string, path: string, markdown: string): ObsidianHandoff {
  const enc = encodeURIComponent; // Obsidian expects %20 for spaces, which encodeURIComponent produces
  const file = path.replace(/\.md$/i, '');
  const base = `obsidian://new?vault=${enc(vault.trim())}&file=${enc(file)}&overwrite=true`;
  const inline = `${base}&content=${enc(markdown)}`;
  return inline.length <= MAX_INLINE_URI_LENGTH ? { uri: inline, needsClipboard: false } : { uri: `${base}&clipboard=true`, needsClipboard: true };
}

/** Must be called from a tap handler: clipboard access and opening another app need a user gesture. */
export async function openInObsidian(vault: string, path: string, markdown: string): Promise<void> {
  const handoff = obsidianNewNote(vault, path, markdown);
  if (handoff.needsClipboard) await navigator.clipboard.writeText(markdown);
  window.location.href = handoff.uri;
}
