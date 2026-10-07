import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import { HttpError } from '../lib/errors';
import { InteractionFailedError, runInBackground, runTranscription } from './gemini';

afterEach(() => vi.useRealTimers());

function fakeAi(create: () => unknown, get: () => unknown) {
  return { interactions: { create: vi.fn(async () => create()), get: vi.fn(async () => get()) } } as unknown as GoogleGenAI & {
    interactions: { create: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  };
}

async function settle<T>(p: Promise<T>): Promise<T> {
  for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(20000);
  return p;
}

describe('runInBackground', () => {
  it('starts in the background, reports the id and polls until completed', async () => {
    vi.useFakeTimers();
    const states = ['in_progress', 'in_progress', 'completed'];
    const ai = fakeAi(() => ({ id: 'i1', status: 'in_progress' }), () => ({ id: 'i1', status: states.shift(), output_text: 'x' }));
    const started: string[] = [];
    const res = await settle(runInBackground(ai, { model: 'm', input: 'x' }, { onStarted: async (id) => void started.push(id) }));
    expect(started).toEqual(['i1']);
    expect(ai.interactions.create.mock.calls[0]![0]).toMatchObject({ background: true });
    expect(res).toMatchObject({ status: 'completed' });
  });

  it('resumes an existing interaction without creating a new one', async () => {
    vi.useFakeTimers();
    const ai = fakeAi(() => ({}), () => ({ status: 'completed' }));
    await settle(runInBackground(ai, { model: 'm', input: 'x' }, { resumeId: 'old' }));
    expect(ai.interactions.create).not.toHaveBeenCalled();
    expect(ai.interactions.get.mock.calls[0]![0]).toBe('old');
  });

  it('keeps polling through dropped connections', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const ai = fakeAi(
      () => ({ id: 'i', status: 'in_progress' }),
      () => {
        if (++calls < 3) throw new Error('Unexpected HTTP client error: TypeError: Load failed');
        return { status: 'completed' };
      },
    );
    await expect(settle(runInBackground(ai, { model: 'm', input: 'x' }))).resolves.toMatchObject({ status: 'completed' });
  });

  it('fails when Gemini gives up', async () => {
    vi.useFakeTimers();
    const ai = fakeAi(() => ({ id: 'i', status: 'in_progress' }), () => ({ status: 'failed' }));
    const p = runInBackground(ai, { model: 'm', input: 'x' });
    const assertion = expect(p).rejects.toBeInstanceOf(InteractionFailedError);
    await settle(p.catch(() => undefined));
    await assertion;
  });
});

describe('runTranscription', () => {
  const modality = () => {
    throw new HttpError('gemini', 400, 'got status: 400. {"error":{"message":"Audio input modality is not enabled for models/x-agent"}}');
  };

  it('retries as a normal request when the background run rejects audio', async () => {
    const ai = fakeAi(() => ({ status: 'completed', output_text: 'ok' }), () => ({}));
    ai.interactions.create.mockImplementationOnce(async () => modality());
    const res = await runTranscription(ai, { model: 'm', input: 'x' }, {}, 'm');
    expect(res).toMatchObject({ status: 'completed' });
    expect(ai.interactions.create.mock.calls[0]![0]).toMatchObject({ background: true });
    expect(ai.interactions.create.mock.calls[1]![0]).not.toHaveProperty('background');
  });

  it('explains when the model cannot take audio at all', async () => {
    const ai = fakeAi(modality, () => ({}));
    await expect(runTranscription(ai, { model: 'm', input: 'x' }, {}, 'gemini-x-agent')).rejects.toThrow(/kann keine Audiodateien/);
  });
});
