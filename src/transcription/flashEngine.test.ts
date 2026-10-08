import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import type { TranscriptResult } from '../types';
import { FlashEngine } from './flashEngine';

const audio = { uri: 'https://x/files/a', mimeType: 'audio/mp4' };
const options = { glossary: [], removeFillers: true };
const seg = (speaker: string, start: string, text: string) => ({ speaker, start, text });

/** Each call to generateContentStream plays the next script: the chunks it sends, then whether it breaks off. */
function fakeAi(scripts: Array<{ chunks: string[]; breaks?: boolean }>) {
  const prompts: string[] = [];
  const generateContentStream = vi.fn(async (params: { contents: Array<{ parts: Array<{ text?: string }> }> }) => {
    prompts.push(params.contents[0]!.parts[0]!.text ?? '');
    const script = scripts.shift();
    if (!script) throw new Error('unexpected request');
    return (async function* () {
      for (const text of script.chunks) yield { text };
      if (script.breaks) throw new Error('Incomplete JSON segment at the end');
    })();
  });
  // The regular (non-streaming) request after a stream that broke before any text fails, too.
  const generateContent = vi.fn(async () => {
    throw new TypeError('Load failed');
  });
  return { ai: { models: { generateContentStream, generateContent } } as unknown as GoogleGenAI, prompts };
}

const firstPart = JSON.stringify({
  title: 'Mönchsbergstraße',
  language: 'de',
  speakers: ['S1', 'S2'],
  segments: [seg('S1', '00:00', 'Eins'), seg('S2', '01:00', 'Zwei'), seg('S1', '02:00', 'Drei')],
});
// Breaks off inside the fourth segment.
const brokenFirst = firstPart.slice(0, -2) + ',{"speaker":"S2","start":"03:00","text":"Vi';
const rest = JSON.stringify({
  title: 'egal',
  language: 'de',
  speakers: ['S1', 'S2'],
  segments: [seg('S1', '02:00', 'Drei'), seg('S2', '03:00', 'Vier'), seg('S1', '04:00', 'Fünf')],
});

describe('FlashEngine', () => {
  it('returns the transcript of an unbroken answer', async () => {
    const { ai } = fakeAi([{ chunks: [firstPart] }]);
    const r = await new FlashEngine(ai, 'm').transcribe(audio, options);
    expect(r.segments.map((s) => s.text)).toEqual(['Eins', 'Zwei', 'Drei']);
  });

  it('keeps the complete part of a broken answer and continues after it', async () => {
    const { ai, prompts } = fakeAi([{ chunks: [brokenFirst], breaks: true }, { chunks: [rest] }]);
    const stored: TranscriptResult[] = [];
    const beforeRetry = vi.fn(async () => {});
    const r = await new FlashEngine(ai, 'm').transcribe(audio, options, { onPartial: (p) => void stored.push(p), beforeRetry });

    expect(r.title).toBe('Mönchsbergstraße');
    expect(r.segments.map((s) => s.text)).toEqual(['Eins', 'Zwei', 'Drei', 'Vier', 'Fünf']);
    expect(stored[0]!.segments).toHaveLength(3);
    expect(beforeRetry).toHaveBeenCalledTimes(1);
    // The last complete segment is asked for again, with the speakers and context so far.
    expect(prompts[1]).toContain('from 02:00 to the end');
    expect(prompts[1]).toContain('Speakers so far: S1, S2');
    expect(prompts[1]).toContain('[01:00] S2: Zwei');
  });

  it('continues from a partial stored by an earlier attempt', async () => {
    const { ai, prompts } = fakeAi([{ chunks: [rest] }]);
    const resumeFrom = JSON.parse(firstPart) as TranscriptResult;
    const r = await new FlashEngine(ai, 'm').transcribe(audio, options, { resumeFrom });
    expect(r.segments.map((s) => s.text)).toEqual(['Eins', 'Zwei', 'Drei', 'Vier', 'Fünf']);
    expect(prompts[0]).toContain('from 02:00 to the end');
  });

  it('keeps the partial if the continuation brings nothing new', async () => {
    const empty = JSON.stringify({ title: '', language: 'de', speakers: [], segments: [] });
    const { ai } = fakeAi([{ chunks: [empty] }]);
    const resumeFrom = JSON.parse(firstPart) as TranscriptResult;
    const r = await new FlashEngine(ai, 'm').transcribe(audio, options, { resumeFrom });
    expect(r.segments.map((s) => s.text)).toEqual(['Eins', 'Zwei', 'Drei']);
  });

  it('stops without another request when the job is stopped during a break', async () => {
    const { ai, prompts } = fakeAi([{ chunks: [brokenFirst], breaks: true }, { chunks: [rest] }]);
    const controller = new AbortController();
    const beforeRetry = async () => controller.abort(new Error('angehalten'));
    await expect(new FlashEngine(ai, 'm').transcribe(audio, options, { signal: controller.signal, beforeRetry })).rejects.toThrow('angehalten');
    expect(prompts).toHaveLength(1);
  });

  it('reports how far into the recording the transcript has got', async () => {
    const { ai } = fakeAi([{ chunks: [firstPart.slice(0, 120), firstPart.slice(120)] }]);
    const positions: Array<number | undefined> = [];
    await new FlashEngine(ai, 'm').transcribe(audio, options, { onProgress: (_c, sec) => positions.push(sec) });
    expect(positions.at(-1)).toBe(120);
  });

  it('stops an answer caught in a loop and continues from the last good segment', async () => {
    const looping = firstPart.slice(0, -2) + ',{"speaker":"S2","start":"03:00","text":"' + 'Vier '.repeat(2000);
    const { ai, prompts } = fakeAi([{ chunks: [looping] }, { chunks: [rest] }]);
    const r = await new FlashEngine(ai, 'm').transcribe(audio, options);
    expect(r.segments.map((s) => s.text)).toEqual(['Eins', 'Zwei', 'Drei', 'Vier', 'Fünf']);
    expect(prompts[1]).toContain('from 02:00 to the end');
  });

  it('waits out a per-minute quota as long as Google asks, then goes on', async () => {
    vi.useFakeTimers();
    try {
      const minuteQuota = JSON.stringify({ error: { code: 429, details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { retryDelay: '20s' }] } });
      let calls = 0;
      const generateContentStream = vi.fn(async () => {
        if (++calls === 1) throw Object.assign(new Error(minuteQuota), { status: 429 });
        return (async function* () {
          yield { text: firstPart };
        })();
      });
      const ai = { models: { generateContentStream } } as unknown as GoogleGenAI;
      const waits: Array<number | undefined> = [];
      const pending = new FlashEngine(ai, 'm').transcribe(audio, options, { onWait: (until) => void waits.push(until) });
      await vi.advanceTimersByTimeAsync(20_000);
      expect(generateContentStream).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_500);
      expect((await pending).segments).toHaveLength(3);
      expect(waits).toHaveLength(2);
      expect(waits[1]).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not wait for a used-up daily quota', async () => {
    const dailyQuota = JSON.stringify({ error: { code: 429, details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } });
    const ai = { models: { generateContentStream: vi.fn(async () => { throw Object.assign(new Error(dailyQuota), { status: 429 }); }) } } as unknown as GoogleGenAI;
    await expect(new FlashEngine(ai, 'm').transcribe(audio, options)).rejects.toMatchObject({ status: 429 });
  });

  it('gives up after three breaks without progress, saying that a retry continues', async () => {
    const { ai } = fakeAi([
      { chunks: ['{"title":"x"'], breaks: true },
      { chunks: [], breaks: true },
      { chunks: ['{'], breaks: true },
    ]);
    await expect(new FlashEngine(ai, 'm').transcribe(audio, options)).rejects.toThrow(/Erneut versuchen/);
  });
});
