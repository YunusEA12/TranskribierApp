import { describe, expect, it } from 'vitest';
import { wordsToSegments } from './transcribeEngine';

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
