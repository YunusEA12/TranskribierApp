import { describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import { HttpError } from '../lib/errors';
import { streamText, uploadAudio } from './gemini';

const audio = { name: 'files/a', uri: 'https://x/files/a', mimeType: 'audio/mp4', uploadedAt: 0 };

describe('upload cancellation', () => {
  it('aborts a stuck upload and does not continue polling after it resolves late', async () => {
    vi.useFakeTimers();
    try {
      let finish!: (file: object) => void;
      const upload = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
      const get = vi.fn();
      const ai = { files: { upload, get } } as unknown as GoogleGenAI;
      const controller = new AbortController();
      const pending = uploadAudio(ai, new Blob(['audio']), 'audio/mp4', controller.signal);
      const check = expect(pending).rejects.toThrow();
      controller.abort();
      await check;
      finish({ name: 'files/a', state: 'PROCESSING' });
      await vi.advanceTimersByTimeAsync(5000);
      expect(get).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

async function* chunks(...texts: string[]) {
  for (const text of texts) yield { text };
}

function fakeAi(impl: (params: Record<string, unknown>) => Promise<AsyncGenerator<{ text: string }>>) {
  const generateContentStream = vi.fn(impl);
  return { ai: { models: { generateContentStream, generateContent: vi.fn(() => new Promise(() => {})) } } as unknown as GoogleGenAI, generateContentStream };
}

describe('streamText', () => {
  it('sends prompt and audio, asks for low thinking and JSON, and joins the streamed text', async () => {
    const { ai, generateContentStream } = fakeAi(async () => chunks('{"a":', '1}'));
    const progress: number[] = [];
    const text = await streamText(ai, 'gemini-x', 'Transkribiere', audio, { jsonSchema: { type: 'object' }, onProgress: (n) => progress.push(n) });
    expect(text).toBe('{"a":1}');
    expect(progress).toEqual([5, 7]);
    const params = generateContentStream.mock.calls[0]![0] as { model: string; contents: unknown; config: Record<string, unknown> };
    expect(params.model).toBe('gemini-x');
    expect(params.contents).toEqual([
      { role: 'user', parts: [{ text: 'Transkribiere' }, { fileData: { fileUri: audio.uri, mimeType: 'audio/mp4' } }] },
    ]);
    expect(params.config).toMatchObject({ responseMimeType: 'application/json', responseJsonSchema: { type: 'object' }, thinkingConfig: { thinkingLevel: 'LOW' } });
  });

  it('sends small recordings inline instead of as a file reference', async () => {
    const { ai, generateContentStream } = fakeAi(async () => chunks('ok'));
    await streamText(ai, 'm', 'p', { data: 'QUJD', mimeType: 'audio/mp4' });
    const params = generateContentStream.mock.calls[0]![0] as { contents: Array<{ parts: unknown[] }> };
    expect(params.contents[0]!.parts[1]).toEqual({ inlineData: { data: 'QUJD', mimeType: 'audio/mp4' } });
  });

  it('retries without thinking settings when the model does not support them', async () => {
    const { ai, generateContentStream } = fakeAi(async (params) => {
      if ((params.config as Record<string, unknown>).thinkingConfig) throw new HttpError('gemini', 400, 'Thinking level is not supported for this model.');
      return chunks('ok');
    });
    await expect(streamText(ai, 'm', 'p', audio)).resolves.toBe('ok');
    expect(generateContentStream).toHaveBeenCalledTimes(2);
  });

  it('explains when the model cannot take audio', async () => {
    const { ai } = fakeAi(async () => {
      throw new HttpError('gemini', 400, 'Audio input modality is not enabled for models/m');
    });
    await expect(streamText(ai, 'm', 'p', audio)).rejects.toThrow(/kann keine Audiodateien/);
  });

  it('gives up when Gemini goes quiet', async () => {
    vi.useFakeTimers();
    const { ai } = fakeAi(async (params) => {
      const signal = (params.config as { abortSignal: AbortSignal }).abortSignal;
      return (async function* () {
        await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
        yield { text: '' };
      })();
    });
    const p = streamText(ai, 'm', 'p', audio);
    const assertion = expect(p).rejects.toThrow(/antwortet nicht/);
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    await assertion;
    vi.useRealTimers();
  });
});

describe('stream recovery', () => {
  it('falls back to regular generation when a stream ignores abort entirely', async () => {
    vi.useFakeTimers();
    const generateContent = vi.fn(async () => ({ text: 'Hallo', candidates: [{ finishReason: 'STOP' }] }));
    const ai = { models: { generateContentStream: async () => new Promise(() => {}), generateContent } } as unknown as GoogleGenAI;
    const pending = streamText(ai, 'm', 'p', audio, { firstChunkMs: 100 });
    const check = expect(pending).resolves.toBe('Hallo');
    await vi.advanceTimersByTimeAsync(100);
    await check;
    expect(generateContent).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('does not start another billable request after user cancellation', async () => {
    const controller = new AbortController();
    const generateContent = vi.fn();
    const ai = { models: { generateContentStream: async () => new Promise(() => {}), generateContent } } as unknown as GoogleGenAI;
    const pending = streamText(ai, 'm', 'p', audio, { signal: controller.signal });
    const check = expect(pending).rejects.toThrow();
    controller.abort();
    await check;
    expect(generateContent).not.toHaveBeenCalled();
  });
});
