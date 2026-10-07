const pad = (n: number) => String(n).padStart(2, '0');

/** Seconds -> "MM:SS", or "HH:MM:SS" from one hour on. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor(s / 60) % 60;
  const mmss = `${pad(m)}:${pad(s % 60)}`;
  return h > 0 ? `${pad(h)}:${mmss}` : mmss;
}

/** "SS", "M:SS", "MM:SS", "H:MM:SS" (optionally with fractions) -> seconds, or null if unparseable. */
export function parseClock(value: string): number | null {
  const parts = value.trim().split(':');
  if (parts.length < 1 || parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  return total;
}

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Transcript id as in PLAN.md 4.3, e.g. "2026-10-07T08-41-12". */
export function transcriptId(d: Date): string {
  return `${localDate(d)}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
