import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { saveSettings } from '../settings/settingsStore';
import { enqueueAudio, kickRunner, processingActive, stopJob, retryJob } from './runner';
import { HttpError } from '../lib/errors';

const mocks = vi.hoisted(() => ({ transcribe: vi.fn(), save: vi.fn(), deleteUpload: vi.fn() }));
vi.mock('../transcription/createEngine', () => ({ createEngine: () => ({ model: 'test-model', transcribe: mocks.transcribe }) }));
vi.mock('../transcription/gemini', async (original) => ({ ...await original<object>(), createGeminiClient: () => ({}), deleteUpload: mocks.deleteUpload }));
vi.mock('../lib/blob', () => ({ blobToBase64: async () => 'YXVkaW8=' }));
vi.mock('../vault/vaultRepo', async (original) => ({ ...await original<object>(), saveTranscript: mocks.save }));

const result = { title: 'Gespräch', language: 'de', speakers: ['S1'], segments: [{ speaker: 'S1', start: '00:00', text: 'Hallo Welt.' }] };
const audio = { blob: new Blob(['audio']), mimeType: 'audio/mp4', source: 'recording' as const, recordedAt: new Date(2026, 9, 7, 12, 0).getTime(), durationSec: 5 };
const finished = () => vi.waitFor(() => expect(processingActive()).toBe(false));

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  await Promise.all(db.tables.map((table) => table.clear()));
  saveSettings({ geminiKey: 'test-key', userName: 'Yunus', githubToken: 'test-token', vaultRepo: 'a/b', storageVerified: true });
  mocks.transcribe.mockReset().mockResolvedValue(result);
  mocks.save.mockReset().mockResolvedValue('sha');
  mocks.deleteUpload.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('audio to shared transcript', () => {
  it('processes inline audio and retains it after a completed upload', async () => {
    const id = await enqueueAudio(audio);
    await vi.waitFor(async () => expect((await db.jobs.get(id))?.status).toBe('done'));
    await finished();
    expect((await db.transcripts.get(id))?.markdown).toContain('Hallo Welt.');
    expect((await db.transcripts.get(id))?.githubPath).toBeTruthy();
    expect(await db.audio.get(id)).toBeDefined();
    expect(mocks.transcribe.mock.calls[0]?.[0]).toMatchObject({ data: 'YXVkaW8=', mimeType: 'audio/mp4' });
  });
  it('recovers a failed save and clears the failed job without retranscribing', async () => {
    mocks.save.mockRejectedValue(new HttpError('github', 503, 'unavailable'));
    const id = await enqueueAudio(audio);
    await vi.waitFor(async () => expect((await db.jobs.get(id))?.status).toBe('failed'));
    await finished();
    mocks.save.mockResolvedValue('sha');
    kickRunner();
    await vi.waitFor(async () => expect((await db.jobs.get(id))?.status).toBe('done'));
    await finished();
    expect((await db.jobs.get(id))?.error).toBeUndefined();
    expect(mocks.transcribe).toHaveBeenCalledTimes(1);
  });
  it('stops an unresponsive transcription, keeps audio and permits retry', async () => {
    mocks.transcribe.mockImplementationOnce(() => new Promise(() => {}));
    const id = await enqueueAudio(audio);
    await vi.waitFor(() => expect(mocks.transcribe).toHaveBeenCalledTimes(1));
    await stopJob(id);
    await finished();
    expect((await db.jobs.get(id))?.status).toBe('failed');
    expect(await db.audio.get(id)).toBeDefined();
    await retryJob(id);
    await vi.waitFor(async () => expect((await db.jobs.get(id))?.status).toBe('done'));
    await finished();
  });
});

describe('remote collisions', () => {
  it('chooses a new filename instead of replacing a different remote recording', async () => {
    const { TranscriptCollisionError } = await import('../vault/vaultRepo');
    mocks.save.mockRejectedValueOnce(new TranscriptCollisionError('collision')).mockResolvedValue('sha');
    const id = await enqueueAudio(audio);
    await vi.waitFor(async () => expect((await db.jobs.get(id))?.status).toBe('done'));
    await finished();
    const transcript = await db.transcripts.get(id);
    expect(transcript?.path).toMatch(/ \(2\)\.md$/);
    expect((await db.jobs.get(id))?.vaultPath).toBe(transcript?.path);
    expect(transcript?.githubPath).toBe(transcript?.path);
  });
});
