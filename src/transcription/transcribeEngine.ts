// Engine B: dedicated speech-to-text model. Returns words with speaker and timing but no title,
// so the title comes from a second, text-only request to the flash model.

import type { GoogleGenAI } from '@google/genai';
import { formatClock } from '../lib/time';
import type { UploadedAudio } from '../jobs/queue';
import type { Segment, TranscriptResult } from '../types';
import type { TranscribeContext, TranscribeOptions, TranscriptionEngine } from './engine';
import { geminiCall, outputText, runTranscription, textContents } from './gemini';
import { buildTitlePrompt } from './prompt';
import { validateTranscriptResult } from './schema';

export interface WordInfo {
  text?: string;
  speaker?: string; // e.g. "spk_1"
  start_offset?: string; // e.g. "12.34s"
}

const SEGMENT_MAX_SEC = 60;
const TITLE_EXCERPT_CHARS = 6000;

const parseOffset = (o: string | undefined) => (o ? parseFloat(o.replace(/s$/, '')) || 0 : 0);

/** Groups words into segments: new segment on speaker change or after about a minute. */
export function wordsToSegments(words: WordInfo[]): { speakers: string[]; segments: Segment[] } {
  const ids = new Map<string, string>();
  const idFor = (spk: string | undefined) => {
    const key = spk ?? '';
    if (!ids.has(key)) ids.set(key, `S${ids.size + 1}`);
    return ids.get(key)!;
  };
  const groups: Array<{ speaker: string; startSec: number; words: string[] }> = [];
  for (const w of words) {
    const speaker = idFor(w.speaker);
    const start = parseOffset(w.start_offset);
    const cur = groups[groups.length - 1];
    if (!cur || cur.speaker !== speaker || start - cur.startSec > SEGMENT_MAX_SEC) {
      groups.push({ speaker, startSec: start, words: [w.text ?? ''] });
    } else {
      cur.words.push(w.text ?? '');
    }
  }
  return {
    speakers: [...ids.values()],
    segments: groups.map((g) => ({
      speaker: g.speaker,
      start: formatClock(g.startSec),
      text: g.words.join(' ').replace(/\s+([,.!?;:])/g, '$1').trim(),
    })),
  };
}

export class TranscribeEngine implements TranscriptionEngine {
  constructor(
    private readonly ai: GoogleGenAI,
    readonly model: string,
    private readonly titleModel: string,
  ) {}

  // Speaker count and filler removal are not configurable for this model.
  async transcribe(audio: UploadedAudio, _options: TranscribeOptions, context: TranscribeContext = {}): Promise<TranscriptResult> {
    // Diarization and custom vocabulary cannot be combined (PLAN.md 3.2); speakers win.
    const res = await runTranscription(
      this.ai,
      {
        model: this.model,
        input: [{ type: 'audio', uri: audio.uri, mime_type: audio.mimeType }],
        generation_config: {
          transcription_config: { mode: { type: 'verbatim', diarization_mode: 'speaker', timestamp_granularities: ['word'] } },
        },
      },
      {
        resumeId: context.resume?.model === this.model ? context.resume.id : undefined,
        onStarted: (id) => context.onStarted?.(id, this.model) ?? Promise.resolve(),
      },
      this.model,
    );
    const words = textContents(res).flatMap((c) =>
      (c.annotations ?? []).filter((a) => a.type === 'word_info').map((a) => a as WordInfo),
    );
    const { speakers, segments } = words.length
      ? wordsToSegments(words)
      : { speakers: ['S1'], segments: [{ speaker: 'S1', start: '00:00', text: outputText(res) }] };

    const excerpt = segments.map((s) => s.text).join(' ').slice(0, TITLE_EXCERPT_CHARS);
    const { title, language } = await this.titleFor(excerpt);
    return validateTranscriptResult({ title, language, speakers, segments });
  }

  private async titleFor(excerpt: string): Promise<{ title: string; language: string }> {
    try {
      const res = await geminiCall(() =>
        this.ai.interactions.create({
          model: this.titleModel,
          input: buildTitlePrompt(excerpt),
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: { type: 'object', properties: { title: { type: 'string' }, language: { type: 'string' } }, required: ['title', 'language'] },
          },
        }),
      );
      const parsed = JSON.parse(outputText(res)) as { title?: string; language?: string };
      return { title: parsed.title ?? '', language: parsed.language ?? '' };
    } catch (e) {
      // A missing title must not cost the transcript.
      console.warn('Title request failed', e);
      return { title: '', language: '' };
    }
  }
}
