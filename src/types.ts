export type AudioSource = 'recording' | 'import';

/** One block of speech. `start` is "MM:SS" or "HH:MM:SS" from the start of the audio. */
export interface Segment {
  speaker: string; // speaker id, e.g. "S1"
  start: string;
  text: string;
}

/** What a transcription engine returns (PLAN.md 3.3). */
export interface TranscriptResult {
  title: string;
  language: string;
  speakers: string[];
  segments: Segment[];
}

/** Frontmatter of a transcript file (PLAN.md 4.3). */
export interface TranscriptMeta {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMin: number;
  user: string;
  language: string;
  speakers: Record<string, string>; // id -> display name
  model: string;
  source: AudioSource;
  tags: string[];
}

export interface Transcript {
  meta: TranscriptMeta;
  segments: Segment[];
}
