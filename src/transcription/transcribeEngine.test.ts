import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import { TranscribeEngine, wordsToSegments } from './transcribeEngine';

afterEach(() => vi.useRealTimers());

describe('TranscribeEngine recovery', () => {
  const audio = { data: 'YXVkaW8=', mimeType: 'audio/mp4' };
  const options = { glossary: [], removeFillers: false };

  it('keeps the transcript when the optional title request never answers', async () => {
    vi.useFakeTimers();
    const create = vi.fn().mockResolvedValueOnce({ output_text: 'Hallo Welt.' }).mockImplementationOnce(() => new Promise(() => {}));
    const engine = new TranscribeEngine({ interactions: { create } } as unknown as GoogleGenAI, 'speech', 'title');
    const pending = engine.transcribe(audio, options);
    const check = expect(pending).resolves.toMatchObject({ title: 'Transkript', segments: [{ text: 'Hallo Welt.' }] });
    await vi.advanceTimersByTimeAsync(30000);
    await check;
    expect(create.mock.calls[1]?.[1].signal.aborted).toBe(true);
  });

  it('cancels an unresponsive transcription without starting a title request', async () => {
    const create = vi.fn(() => new Promise(() => {}));
    const engine = new TranscribeEngine({ interactions: { create } } as unknown as GoogleGenAI, 'speech', 'title');
    const controller = new AbortController();
    const pending = engine.transcribe(audio, options, { signal: controller.signal });
    const check = expect(pending).rejects.toThrow();
    controller.abort();
    await check;
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('respects cancellation during title generation', async () => {
    const create = vi.fn().mockResolvedValueOnce({ output_text: 'Hallo Welt.' }).mockImplementationOnce(() => new Promise(() => {}));
    const engine = new TranscribeEngine({ interactions: { create } } as unknown as GoogleGenAI, 'speech', 'title');
    const controller = new AbortController();
    const pending = engine.transcribe(audio, options, { signal: controller.signal });
    const check = expect(pending).rejects.toThrow();
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    controller.abort();
    await check;
  });
});

describe('wordsToSegments', () => {
  it('groups by speaker and maps speaker labels to S1..Sn', () => {
    const r = wordsToSegments([
      { text: 'Hallo', speaker: 'spk_2', start_offset: '0.1s' },
      { text: 'du', speaker: 'spk_2', start_offset: '0.4s' },
      { text: '.', speaker: 'spk_2', start_offset: '0.5s' },
      { text: 'Ja', speaker: 'spk_1', start_offset: '2s' },
      { text: '?', speaker: 'spk_1', start_offset: '2.2s' },
    ]);
    expect(r.speakers).toEqual(['S1', 'S2']);
    expect(r.segments).toEqual([
      { speaker: 'S1', start: '00:00', text: 'Hallo du.' },
      { speaker: 'S2', start: '00:02', text: 'Ja?' },
    ]);
  });

  it('splits long monologues after about a minute', () => {
    const r = wordsToSegments([
      { text: 'a', speaker: 'spk_1', start_offset: '0s' },
      { text: 'b', speaker: 'spk_1', start_offset: '59s' },
      { text: 'c', speaker: 'spk_1', start_offset: '61.5s' },
      { text: 'd', speaker: 'spk_1', start_offset: '3700s' },
    ]);
    expect(r.segments.map((s) => [s.start, s.text])).toEqual([
      ['00:00', 'a b'],
      ['01:01', 'c'],
      ['01:01:40', 'd'],
    ]);
  });

  it('handles missing speaker and timing', () => {
    const r = wordsToSegments([{ text: 'x' }, { text: 'y' }]);
    expect(r.segments).toEqual([{ speaker: 'S1', start: '00:00', text: 'x y' }]);
  });
});
