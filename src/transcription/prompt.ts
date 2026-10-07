// Prompt for the flash engine (PLAN.md 3.4). Verbatim: nothing summarized, smoothed or invented.

import type { TranscribeOptions } from './engine';

export function buildTranscriptionPrompt(options: TranscribeOptions): string {
  const lines = [
    'Transcribe this audio recording verbatim.',
    '- Do not summarize, shorten, paraphrase, add or invent anything. Every spoken sentence must appear in the transcript.',
    '- Mark unintelligible passages as [unverständlich]. Do not guess.',
    '- Label speakers S1, S2, … in order of first appearance and keep each label consistent for the whole recording.',
    options.speakerCount
      ? `- There are probably ${options.speakerCount} speakers.`
      : '- Determine the number of speakers yourself (usually 1 to 5).',
    '- Start a new segment at every change of speaker; split long monologues into segments of roughly 60 seconds.',
    '- "start" is the time the segment begins, as MM:SS, or HH:MM:SS from one hour on.',
    '- Keep the original language of the recording, including switches between languages within a sentence. Do not translate.',
    options.removeFillers
      ? '- Leave out pure filler sounds such as "äh", "ähm", "uh", "um". Change nothing else.'
      : '- Keep filler sounds such as "äh" and "ähm".',
  ];
  if (options.glossary.length) {
    lines.push(`- Prefer these spellings when they match what is said: ${options.glossary.join(', ')}.`);
  }
  lines.push('- "title": at most 8 words, in the language of the recording, describing the topic.');
  lines.push('- "language": the main language as ISO 639-1 code.');
  return lines.join('\n');
}

export function buildTitlePrompt(transcriptExcerpt: string): string {
  return [
    'Here is the beginning of a transcript.',
    'Return a "title" of at most 8 words in the language of the transcript that describes the topic,',
    'and "language", the main language as ISO 639-1 code.',
    '',
    transcriptExcerpt,
  ].join('\n');
}
