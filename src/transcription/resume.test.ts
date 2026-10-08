import { describe, expect, it } from 'vitest';
import type { TranscriptResult } from '../types';
import { joinTranscripts, latestStartSec, looksStuck, parseTruncatedJson, resumePlan, salvageTranscript } from './resume';

const full = {
  title: 'Besprechung',
  language: 'de',
  speakers: ['S1', 'S2'],
  segments: [
    { speaker: 'S1', start: '00:00', text: 'Hallo {zusammen}' },
    { speaker: 'S2', start: '00:05', text: 'Er sagte: "Klammer ] zu"' },
    { speaker: 'S1', start: '00:09', text: 'Gut.' },
  ],
};
const json = JSON.stringify(full);

describe('parseTruncatedJson', () => {
  it('parses complete JSON unchanged', () => {
    expect(parseTruncatedJson(json)).toEqual(full);
  });

  it('keeps the complete segments when the text breaks off inside one', () => {
    const cutInThird = json.slice(0, json.indexOf('Gut.'));
    expect(parseTruncatedJson(cutInThird)).toEqual({ ...full, segments: full.segments.slice(0, 2) });
  });

  it('is not fooled by brackets and escaped quotes inside strings', () => {
    const cutInSecond = json.slice(0, json.indexOf(' zu'));
    expect(parseTruncatedJson(cutInSecond)).toEqual({ ...full, segments: full.segments.slice(0, 1) });
  });

  it('returns null while nothing is complete', () => {
    expect(parseTruncatedJson('{"title":"Bespr')).toBeNull();
    expect(parseTruncatedJson('')).toBeNull();
  });
});

describe('salvageTranscript', () => {
  it('returns the complete segments of a broken answer', () => {
    const r = salvageTranscript(json.slice(0, json.indexOf('Gut.')));
    expect(r?.segments).toHaveLength(2);
    expect(r?.title).toBe('Besprechung');
  });

  it('leaves the title empty if it never arrived', () => {
    const r = salvageTranscript('{"segments":[{"speaker":"S1","start":"00:00","text":"Hallo"},{"speaker":"S1","start":"00:04","te');
    expect(r).toMatchObject({ title: '', segments: [{ text: 'Hallo' }] });
  });

  it('returns null without a complete segment', () => {
    expect(salvageTranscript('{"title":"Besprechung","language":"de","speakers":["S1"],"segments":[{"speaker":"S1","sta')).toBeNull();
  });
});

describe('resumePlan', () => {
  it('redoes the last segment from its start', () => {
    const plan = resumePlan(full);
    expect(plan?.resumeAtSec).toBe(9);
    expect(plan?.kept.segments).toEqual(full.segments.slice(0, 2));
  });

  it('drops speakers that only appeared in the redone segment', () => {
    const r: TranscriptResult = { ...full, speakers: ['S1', 'S2', 'S3'], segments: [...full.segments, { speaker: 'S3', start: '00:15', text: 'Ich' }] };
    expect(resumePlan(r)?.kept.speakers).toEqual(['S1', 'S2']);
  });

  it('starts over when there is too little to keep', () => {
    expect(resumePlan({ ...full, segments: full.segments.slice(0, 1) })).toBeNull();
  });
});

describe('joinTranscripts', () => {
  const before: TranscriptResult = { title: 'Besprechung', language: 'de', speakers: ['S1', 'S2'], segments: full.segments.slice(0, 2) };

  it('appends the continuation and merges the speakers', () => {
    const after: TranscriptResult = {
      title: 'Anderer Titel',
      language: 'de',
      speakers: ['S1', 'S3'],
      segments: [
        { speaker: 'S1', start: '00:09', text: 'Gut.' },
        { speaker: 'S3', start: '00:12', text: 'Neu hier.' },
      ],
    };
    const r = joinTranscripts(before, after, 9);
    expect(r.title).toBe('Besprechung');
    expect(r.speakers).toEqual(['S1', 'S2', 'S3']);
    expect(r.segments.map((s) => s.start)).toEqual(['00:00', '00:05', '00:09', '00:12']);
  });

  it('drops a continuation that starts over from the beginning', () => {
    const after: TranscriptResult = {
      title: '',
      language: '',
      speakers: ['S1'],
      segments: [
        { speaker: 'S1', start: '00:00', text: 'Hallo zusammen' },
        { speaker: 'S1', start: '01:30', text: 'Weiter' },
      ],
    };
    expect(joinTranscripts(before, after, 90).segments.map((s) => s.text)).toEqual(['Hallo {zusammen}', 'Er sagte: "Klammer ] zu"', 'Weiter']);
  });

  it('takes the title from the continuation if the first part had none', () => {
    const after: TranscriptResult = { title: 'Später', language: 'de', speakers: ['S1'], segments: [{ speaker: 'S1', start: '00:09', text: 'x' }] };
    expect(joinTranscripts({ ...before, title: '' }, after, 9).title).toBe('Später');
  });
});

describe('latestStartSec', () => {
  it('finds the start of the newest segment while the answer is still arriving', () => {
    expect(latestStartSec(json.slice(0, json.indexOf('Gut.')))).toBe(9);
    expect(latestStartSec('{"segments":[{"speaker":"S1","start":"01:02:03","te')).toBe(3723);
  });

  it('ignores quoted words inside the text and answers without segments', () => {
    expect(latestStartSec('{"title":"x"')).toBeUndefined();
    expect(latestStartSec('{"segments":[{"speaker":"S1","start":"00:05","text":"er sagte \\"start\\": \\"09:99\\"')).toBe(5);
  });
});

describe('looksStuck', () => {
  it('accepts normal segments', () => {
    expect(looksStuck(json)).toBe(false);
  });

  it('flags a segment that runs on far longer than a minute of speech', () => {
    expect(looksStuck(`{"segments":[{"speaker":"S1","start":"00:00","text":"${'ja ja '.repeat(2000)}`)).toBe(true);
  });
});
