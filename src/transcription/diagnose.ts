// Step-by-step check of the whole Gemini path with a 2-second test tone, so a problem on a real
// phone can be located without developer tools. The log contains no key.

import { googleErrorDetail, toUserMessage } from '../lib/errors';
import type { Settings } from '../settings/settingsStore';
import { checkModel, createGeminiClient, deleteUpload, geminiCall, listModels, outputText, uploadAudio } from './gemini';
import { buildTranscriptionPrompt } from './prompt';
import { TRANSCRIPT_SCHEMA } from './schema';

export interface DiagnosisLine {
  ok: boolean | null; // null = information
  text: string;
}

const BACKGROUND_WATCH_MS = 90_000;
const POLL_MS = 3000;

/** 2 s of a 440 Hz tone as 16 kHz mono WAV. */
export function testToneWav(seconds = 2, rate = 16000): Blob {
  const samples = seconds * rate;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => v.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const envelope = Math.min(1, i / 800, (samples - i) / 800);
    v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000 * envelope), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

const secs = (start: number) => `${((performance.now() - start) / 1000).toFixed(1).replace('.', ',')} s`;
const snippet = (text: string) => `„${text.replace(/\s+/g, ' ').trim().slice(0, 80)}${text.length > 80 ? '…' : ''}“`;

export async function diagnoseTranscription(s: Settings, log: (line: DiagnosisLine) => void): Promise<void> {
  try {
    await runChecks(s, log);
  } finally {
    log({ ok: null, text: 'Test beendet.' });
  }
}

async function runChecks(s: Settings, log: (line: DiagnosisLine) => void): Promise<void> {
  const key = s.geminiKey.trim();
  const clean = (e: unknown) => {
    const detail = `${toUserMessage(e, 'gemini')} (${googleErrorDetail(e).slice(0, 160)})`;
    return key ? detail.split(key).join('***') : detail;
  };
  if (!key) {
    log({ ok: false, text: 'Kein Gemini-Key eingetragen.' });
    return;
  }
  const model = s.flashModel.trim();
  const ai = createGeminiClient(key);
  log({ ok: null, text: `Modell: ${model} · App-Version ${__APP_VERSION__} · ${navigator.userAgent.match(/(iPhone|Android|Mac|Windows)[^;)]*/)?.[0] ?? 'Gerät unbekannt'}` });

  let t = performance.now();
  try {
    const models = await listModels(ai);
    log({ ok: true, text: `Key gültig, ${models.length} Modelle (${secs(t)})` });
    await checkModel(ai, model);
    log({ ok: true, text: `Modell „${model}“ verfügbar` });
  } catch (e) {
    log({ ok: false, text: `Key/Modell: ${clean(e)}` });
    return;
  }

  t = performance.now();
  let upload;
  try {
    upload = await uploadAudio(ai, testToneWav(), 'audio/wav');
    log({ ok: true, text: `Testton hochgeladen (${secs(t)})` });
  } catch (e) {
    log({ ok: false, text: `Hochladen: ${clean(e)}` });
    return;
  }

  const audio = { type: 'audio' as const, uri: upload.uri, mime_type: upload.mimeType };
  try {
    t = performance.now();
    try {
      const res = await geminiCall(() =>
        ai.interactions.create({ model, input: [{ type: 'text', text: 'Was hörst du? Antworte in einem kurzen Satz.' }, audio] }, { timeout: 120_000 }),
      );
      const text = outputText(res);
      log({ ok: Boolean(text), text: `Direkte Anfrage (${secs(t)}): ${text ? snippet(text) : 'leere Antwort'}` });
    } catch (e) {
      log({ ok: false, text: `Direkte Anfrage (${secs(t)}): ${clean(e)}` });
    }

    t = performance.now();
    try {
      const res = await geminiCall(() =>
        ai.interactions.create(
          {
            model,
            input: [{ type: 'text', text: buildTranscriptionPrompt({ glossary: [], removeFillers: true }) }, audio],
            response_format: { type: 'text', mime_type: 'application/json', schema: TRANSCRIPT_SCHEMA },
          },
          { timeout: 120_000 },
        ),
      );
      const text = outputText(res);
      let ok = false;
      try {
        JSON.parse(text);
        ok = true;
      } catch {
        ok = false;
      }
      log({ ok, text: `Transkript-Format (${secs(t)}): ${ok ? 'Antwort ist gültiges JSON' : `kein gültiges JSON: ${snippet(text || 'leer')}`}` });
    } catch (e) {
      log({ ok: false, text: `Transkript-Format (${secs(t)}): ${clean(e)}` });
    }

    t = performance.now();
    try {
      const created = (await geminiCall(() =>
        ai.interactions.create({ model, input: [{ type: 'text', text: 'Was hörst du? Antworte in einem kurzen Satz.' }, audio], background: true }, { timeout: 60_000 }),
      )) as { id?: string; status?: string };
      log({ ok: Boolean(created.id), text: `Hintergrund-Auftrag angenommen (${secs(t)}): Status „${created.status ?? '–'}“${created.id ? '' : ', keine Auftragsnummer'}` });
      if (created.id) {
        let last = created.status ?? '';
        let done = created.status === 'completed';
        while (!done && performance.now() - t < BACKGROUND_WATCH_MS) {
          await new Promise((r) => setTimeout(r, POLL_MS));
          try {
            const it = (await geminiCall(() => ai.interactions.get(created.id!, undefined, { timeout: 30_000, maxRetries: 0 }))) as { status?: string };
            if (it.status !== last) {
              last = it.status ?? '';
              log({ ok: null, text: `Hintergrund nach ${secs(t)}: Status „${last}“` });
            }
            if (it.status === 'completed') {
              done = true;
              const text = outputText(it);
              log({ ok: Boolean(text), text: `Hintergrund fertig (${secs(t)}): ${text ? snippet(text) : 'leere Antwort'}` });
            } else if (['failed', 'cancelled', 'incomplete', 'budget_exceeded'].includes(it.status ?? '')) {
              done = true;
              log({ ok: false, text: `Hintergrund abgebrochen: Status „${it.status}“` });
            }
          } catch (e) {
            log({ ok: false, text: `Nachfragen (${secs(t)}): ${clean(e)}` });
          }
        }
        if (!done) {
          log({ ok: false, text: `Hintergrund nach ${secs(t)} immer noch „${last}“` });
          await ai.interactions.cancel(created.id).catch(() => undefined);
        }
      }
    } catch (e) {
      log({ ok: false, text: `Hintergrund-Auftrag (${secs(t)}): ${clean(e)}` });
    }
  } finally {
    await deleteUpload(ai, upload.name);
  }
}
