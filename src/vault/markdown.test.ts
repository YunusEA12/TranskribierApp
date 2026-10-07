import { describe, expect, it } from 'vitest';
import { createTranscript, parseMarkdown, toMarkdown } from './markdown';
import type { Transcript } from '../types';

const sample: Transcript = {
  meta: {
    id: '2026-10-07T08-41-12',
    title: 'Projektplanung Transkript-App',
    date: '2026-10-07',
    time: '08:41',
    durationMin: 42,
    user: 'yunus',
    language: 'de',
    speakers: { S1: 'Yunus', S2: 'Sprecher 2' },
    model: 'gemini-3.8-flash',
    source: 'recording',
    tags: ['transkript'],
  },
  segments: [
    { speaker: 'S1', start: '00:00', text: 'Text des ersten Abschnitts …' },
    { speaker: 'S2', start: '00:42', text: 'Text des zweiten Abschnitts …' },
  ],
};

describe('toMarkdown', () => {
  it('produces exactly the format from PLAN.md 4.3', () => {
    expect(toMarkdown(sample)).toBe(`---
id: 2026-10-07T08-41-12
title: "Projektplanung Transkript-App"
date: 2026-10-07
time: "08:41"
duration_min: 42
user: yunus
language: de
speakers:
  S1: Yunus
  S2: Sprecher 2
model: gemini-3.8-flash
source: recording
tags: [transkript]
---

# Projektplanung Transkript-App

**[00:00] Yunus:** Text des ersten Abschnitts …

**[00:42] Sprecher 2:** Text des zweiten Abschnitts …
`);
  });

  it('quotes YAML values that would otherwise be misread', () => {
    const t = { ...sample, meta: { ...sample.meta, title: 'Er sagte "Hallo": Test', speakers: { S1: 'Dr. Müller: Chef', S2: 'yes', S3: '42' } } };
    const md = toMarkdown(t);
    expect(md).toContain('title: "Er sagte \\"Hallo\\": Test"');
    expect(md).toContain('  S1: "Dr. Müller: Chef"');
    expect(md).toContain('  S2: "yes"');
    expect(md).toContain('  S3: "42"');
  });

  it('keeps each segment on one line', () => {
    const t = { ...sample, segments: [{ speaker: 'S1', start: '00:00', text: 'Zeile eins\n\nZeile zwei' }] };
    expect(toMarkdown(t)).toContain('**[00:00] Yunus:** Zeile eins Zeile zwei\n');
  });
});

describe('parseMarkdown', () => {
  it('round-trips the sample', () => {
    expect(parseMarkdown(toMarkdown(sample))).toEqual(sample);
  });

  it('round-trips tricky values', () => {
    const t: Transcript = {
      meta: { ...sample.meta, title: 'Über "Öl" & mehr: #1', speakers: { S1: 'Dr. Müller: Chef', S2: "O'Neil" }, source: 'import' },
      segments: [
        { speaker: 'S1', start: '01:02:03', text: 'Hallo **fett** und [unverständlich].' },
        { speaker: 'S2', start: '01:02:10', text: 'Ja: genau.' },
      ],
    };
    expect(parseMarkdown(toMarkdown(t))).toEqual(t);
  });

  it('accepts a file edited in Obsidian (CRLF, comments, continuation lines)', () => {
    const md = toMarkdown(sample).replace('source: recording', 'source: recording        # recording | import')
      .replace('Text des zweiten Abschnitts …', 'Text des zweiten Abschnitts …\nmanuell ergänzt')
      .replace(/\n/g, '\r\n');
    const t = parseMarkdown(md);
    expect(t.meta.source).toBe('recording');
    expect(t.segments[1]!.text).toBe('Text des zweiten Abschnitts …\nmanuell ergänzt');
  });

  it('keeps unknown speaker names as ids', () => {
    const md = toMarkdown(sample).replace('**[00:42] Sprecher 2:**', '**[00:42] Gast:**');
    expect(parseMarkdown(md).segments[1]!.speaker).toBe('Gast');
  });

  it('rejects files without frontmatter', () => {
    expect(() => parseMarkdown('# Nur Text')).toThrow();
  });
});

describe('createTranscript', () => {
  it('fills metadata from the result and context', () => {
    const t = createTranscript(
      { title: 'Test', language: 'de', speakers: ['S1', 'S2'], segments: [{ speaker: 'S1', start: '00:00', text: 'Hi' }] },
      { recordedAt: new Date(2026, 9, 7, 8, 41, 12), durationSec: 2530, user: 'Yunus', model: 'm', source: 'import' },
    );
    expect(t.meta).toEqual({
      id: '2026-10-07T08-41-12',
      title: 'Test',
      date: '2026-10-07',
      time: '08:41',
      durationMin: 42,
      user: 'yunus',
      language: 'de',
      speakers: { S1: 'Sprecher 1', S2: 'Sprecher 2' },
      model: 'm',
      source: 'import',
      tags: ['transkript'],
    });
  });
});
