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
});
