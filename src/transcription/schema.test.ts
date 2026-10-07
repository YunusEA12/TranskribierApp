import { describe, expect, it } from 'vitest';
import { TranscriptValidationError, validateTranscriptResult } from './schema';

describe('validateTranscriptResult', () => {
  it('accepts a well-formed result', () => {
    const r = {
      title: 'Test',
      language: 'de',
      speakers: ['S1', 'S2'],
      segments: [
        { speaker: 'S1', start: '00:00', text: 'Hallo' },
        { speaker: 'S2', start: '00:05', text: 'Hi' },
      ],
    };
    expect(validateTranscriptResult(r)).toEqual(r);
  });

  it('normalizes timestamps', () => {
    const r = validateTranscriptResult({
      title: 'T',
      language: 'DE',
      speakers: ['S1'],
      segments: [
        { speaker: 'S1', start: '0:05', text: 'a' },
        { speaker: 'S1', start: '1:02:03', text: 'b' },
        { speaker: 'S1', start: '75', text: 'c' },
        { speaker: 'S1', start: 'kaputt', text: 'd' },
      ],
    });
    expect(r.segments.map((s) => s.start)).toEqual(['00:05', '01:02:03', '01:15', '01:15']);
    expect(r.language).toBe('de');
  });

  it('derives the speaker list from the segments', () => {
    const r = validateTranscriptResult({
      title: 'T',
      language: 'de',
      speakers: ['S1', 'S9'],
      segments: [
        { speaker: 'S2', start: '00:00', text: 'a' },
        { speaker: 'S1', start: '00:01', text: 'b' },
      ],
    });
    expect(r.speakers).toEqual(['S1', 'S2']);
  });

  it('drops empty segments and defaults title', () => {
    const r = validateTranscriptResult({
      title: ' ',
      language: 'de',
      speakers: [],
      segments: [
        { speaker: 'S1', start: '00:00', text: '  ' },
        { speaker: '', start: '00:01', text: 'x' },
      ],
    });
    expect(r.title).toBe('Transkript');
    expect(r.segments).toEqual([{ speaker: 'S1', start: '00:01', text: 'x' }]);
  });

  it('rejects unusable output', () => {
    expect(() => validateTranscriptResult(null)).toThrow(TranscriptValidationError);
    expect(() => validateTranscriptResult({ segments: 'x' })).toThrow(TranscriptValidationError);
    expect(() => validateTranscriptResult({ segments: [] })).toThrow(TranscriptValidationError);
    expect(() => validateTranscriptResult({ segments: [{ speaker: 'S1' }] })).toThrow(TranscriptValidationError);
  });
});
