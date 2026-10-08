import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiClient, streamText } from './gemini';
import { TRANSCRIPT_SCHEMA } from './schema';

afterEach(() => vi.restoreAllMocks());
describe('installed Gemini SDK transport', () => {
  it('sends inline audio and structured output through the real SDK and decodes SSE', async () => {
    const answer = JSON.stringify({ title: 'Test', language: 'de', speakers: ['S1'], segments: [{ speaker: 'S1', start: '00:00', text: 'Hallo' }] });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: answer }] }, finishReason: 'STOP' }] })}\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));
    const ai = createGeminiClient('test-key');
    await expect(streamText(ai, 'test-model', 'Transcribe', { data: 'YXVkaW8=', mimeType: 'audio/mp4' }, { jsonSchema: TRANSCRIPT_SCHEMA })).resolves.toBe(answer);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toContain('streamGenerateContent');
    const body = JSON.parse(String(init?.body));
    expect(JSON.stringify(body.contents)).toContain('YXVkaW8=');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('repeats a request Google answers with a server error', async () => {
    vi.useFakeTimers();
    try {
      const overloaded = () => new Response(JSON.stringify({ error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } }), { status: 503 });
      const ok = new Response(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Hallo' }] }, finishReason: 'STOP' }] })}\n\n`, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(overloaded()).mockResolvedValueOnce(overloaded()).mockResolvedValueOnce(ok);
      const pending = streamText(createGeminiClient('test-key'), 'test-model', 'Transcribe', { data: 'YXVkaW8=', mimeType: 'audio/mp4' });
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pending).resolves.toBe('Hallo');
      expect(fetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
