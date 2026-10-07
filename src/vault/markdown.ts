// Transcript <-> Markdown. The format is an interface to Obsidian and later analysis (PLAN.md 4.3):
// do not change fields or the line format without an entry in PLAN.md section 10.

import { localDate, localTime, transcriptId } from '../lib/time';
import type { AudioSource, Transcript, TranscriptMeta, TranscriptResult } from '../types';

export interface TranscriptContext {
  recordedAt: Date;
  durationSec: number;
  user: string;
  model: string;
  source: AudioSource;
}

export function defaultSpeakerName(index: number): string {
  return `Sprecher ${index + 1}`;
}

export function userSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-') || 'unbekannt';
}

export function createTranscript(result: TranscriptResult, ctx: TranscriptContext): Transcript {
  return {
    meta: {
      id: transcriptId(ctx.recordedAt),
      title: result.title,
      aliases: [result.title],
      date: localDate(ctx.recordedAt),
      time: localTime(ctx.recordedAt),
      durationMin: Math.round(ctx.durationSec / 60),
      user: userSlug(ctx.user),
      language: result.language || 'und',
      speakers: Object.fromEntries(result.speakers.map((id, i) => [id, defaultSpeakerName(i)])),
      model: ctx.model,
      source: ctx.source,
      tags: ['transkript'],
    },
    segments: result.segments,
  };
}

// ---------- writing ----------

const PLAIN_SCALAR = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;
const RESERVED = /^(true|false|yes|no|on|off|null|~|[-+]?\d[\d._]*)$/i;

/** YAML scalar: plain where that is unambiguous (keeps the format readable), JSON-quoted otherwise. */
function yamlScalar(value: string): string {
  return PLAIN_SCALAR.test(value) && !RESERVED.test(value) && !value.endsWith(' ') ? value : JSON.stringify(value);
}

/** One segment = one line, so the body stays parseable. */
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim();

export function toMarkdown(t: Transcript): string {
  const m = t.meta;
  const lines = [
    '---',
    `id: ${m.id}`,
    `title: ${JSON.stringify(m.title)}`,
    `aliases: [${m.aliases.map((a) => JSON.stringify(a)).join(', ')}]`,
    `date: ${m.date}`,
    `time: "${m.time}"`,
    `duration_min: ${m.durationMin}`,
    `user: ${yamlScalar(m.user)}`,
    `language: ${yamlScalar(m.language)}`,
    'speakers:',
    ...Object.entries(m.speakers).map(([id, name]) => `  ${id}: ${yamlScalar(name)}`),
    `model: ${yamlScalar(m.model)}`,
    `source: ${m.source}`,
    `tags: [${m.tags.map(yamlScalar).join(', ')}]`,
    '---',
    '',
    `# ${m.title}`,
    '',
  ];
  const body = t.segments.map((s) => `**[${s.start}] ${m.speakers[s.speaker] ?? s.speaker}:** ${oneLine(s.text)}`);
  return `${lines.join('\n')}\n${body.join('\n\n')}\n`;
}

// ---------- reading ----------

function parseScalar(raw: string): string {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'")) return v.slice(1, v.lastIndexOf("'")).replace(/''/g, "'");
  return v.replace(/\s+#.*$/, '');
}

// Items of a YAML flow list: quoted strings may contain commas and brackets.
const LIST_ITEM_RE = /"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,\s][^,]*/g;

function parseList(raw: string): string[] {
  const v = raw.trim();
  if (!v.startsWith('[')) return v ? [parseScalar(v)] : [];
  const inner = v.slice(1, v.lastIndexOf(']'));
  return (inner.match(LIST_ITEM_RE) ?? []).map((s) => parseScalar(s)).filter(Boolean);
}

const SEGMENT_RE = /^\*\*\[(\d{1,2}:\d{2}(?::\d{2})?)\] (.+?):\*\*\s?(.*)$/;

export class MarkdownFormatError extends Error {}

export function parseMarkdown(text: string): Transcript {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') throw new MarkdownFormatError('Frontmatter fehlt.');
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new MarkdownFormatError('Frontmatter ist nicht abgeschlossen.');

  const fields: Record<string, string> = {};
  const speakers: Record<string, string> = {};
  let inSpeakers = false;
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const nested = /^\s+([^:]+):\s*(.*)$/.exec(line);
    if (inSpeakers && nested) {
      speakers[nested[1]!.trim()] = parseScalar(nested[2]!);
      continue;
    }
    const top = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!top) continue;
    inSpeakers = top[1] === 'speakers' && top[2]!.trim() === '';
    fields[top[1]!] = top[2]!;
  }

  const meta: TranscriptMeta = {
    id: parseScalar(fields.id ?? ''),
    title: parseScalar(fields.title ?? ''),
    aliases: parseList(fields.aliases ?? ''),
    date: parseScalar(fields.date ?? ''),
    time: parseScalar(fields.time ?? ''),
    durationMin: Number(parseScalar(fields.duration_min ?? '0')) || 0,
    user: parseScalar(fields.user ?? ''),
    language: parseScalar(fields.language ?? ''),
    speakers,
    model: parseScalar(fields.model ?? ''),
    source: parseScalar(fields.source ?? '') === 'import' ? 'import' : 'recording',
    tags: parseList(fields.tags ?? ''),
  };

  // Body lines carry display names; map them back to speaker ids.
  const idByName = new Map<string, string>();
  for (const [id, name] of Object.entries(speakers)) if (!idByName.has(name)) idByName.set(name, id);

  const segments: Transcript['segments'] = [];
  for (const line of lines.slice(end + 1)) {
    const m = SEGMENT_RE.exec(line);
    if (m) {
      segments.push({ start: m[1]!, speaker: idByName.get(m[2]!) ?? m[2]!, text: m[3]! });
    } else if (line.trim() && !line.startsWith('# ') && segments.length) {
      const last = segments[segments.length - 1]!;
      last.text += `\n${line}`;
    }
  }
  return { meta, segments };
}
