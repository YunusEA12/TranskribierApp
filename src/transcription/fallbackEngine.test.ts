import { describe, expect, it } from 'vitest';
import { HttpError } from '../lib/errors';
import type { TranscriptResult } from '../types';
import type { TranscribeContext, TranscriptionEngine } from './engine';
import { FallbackEngine } from './fallbackEngine';

const result = (title: string): TranscriptResult => ({ title, language: 'de', speakers: ['S1'], segments: [{ speaker: 'S1', start: '00:00', text: 'x' }] });
const audio = { name: 'files/a', uri: 'u', mimeType: 'audio/webm', uploadedAt: 0 };
const options = { glossary: [], removeFillers: true };

function engine(model: string, behavior: () => Promise<TranscriptResult>): TranscriptionEngine & { calls: number } {
  const e = {
    model,
    calls: 0,
    transcribe: () => {
      e.calls++;
      return behavior();
    },
  };
  return e;
}

describe('FallbackEngine', () => {
  it('uses the primary model when it works', async () => {
    const primary = engine('big', async () => result('A'));
    const fallback = engine('small', async () => result('B'));
    const e = new FallbackEngine(primary, fallback);
    expect((await e.transcribe(audio, options)).title).toBe('A');
    expect(e.model).toBe('big');
    expect(fallback.calls).toBe(0);
  });

  it('switches to the fallback when the quota is exhausted', async () => {
    const primary = engine('big', async () => {
      throw new HttpError('gemini', 429, 'RESOURCE_EXHAUSTED');
    });
    const fallback = engine('small', async () => result('B'));
    const e = new FallbackEngine(primary, fallback);
    expect((await e.transcribe(audio, options)).title).toBe('B');
    expect(e.model).toBe('small');
  });

  it('switches to the fallback when Google keeps failing for the main model', async () => {
    const primary = engine('big', async () => {
      throw new HttpError('gemini', 503, 'The model is overloaded.');
    });
    const e = new FallbackEngine(primary, engine('small', async () => result('B')));
    expect((await e.transcribe(audio, options)).title).toBe('B');
  });

  it('does not hide other errors', async () => {
    const primary = engine('big', async () => {
      throw new HttpError('gemini', 403, 'bad key');
    });
    const fallback = engine('small', async () => result('B'));
    await expect(new FallbackEngine(primary, fallback).transcribe(audio, options)).rejects.toThrow('bad key');
    expect(fallback.calls).toBe(0);
  });

  it('lets the fallback continue from what the primary model already transcribed', async () => {
    const partial = result('Teil');
    const primary = {
      model: 'big',
      transcribe: async (_a: unknown, _o: unknown, context?: TranscribeContext) => {
        await context?.onPartial?.(partial);
        throw new HttpError('gemini', 429, 'RESOURCE_EXHAUSTED');
      },
    };
    let resumedFrom: TranscriptResult | undefined;
    const fallback = {
      model: 'small',
      transcribe: async (_a: unknown, _o: unknown, context?: TranscribeContext) => {
        resumedFrom = context?.resumeFrom;
        return result('B');
      },
    };
    const stored: TranscriptResult[] = [];
    await new FallbackEngine(primary, fallback).transcribe(audio, options, { onPartial: (p) => void stored.push(p) });
    expect(resumedFrom).toBe(partial);
    expect(stored).toEqual([partial]);
  });

  it('reports the fallback error when both are exhausted', async () => {
    const exhausted = async (): Promise<TranscriptResult> => {
      throw new HttpError('gemini', 429, 'RESOURCE_EXHAUSTED');
    };
    const e = new FallbackEngine(engine('big', exhausted), engine('small', exhausted));
    await expect(e.transcribe(audio, options)).rejects.toMatchObject({ status: 429 });
  });
});
