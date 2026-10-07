// Step-by-step check of the whole Gemini path with a 2-second test tone, so a problem on a real
// phone can be located without developer tools. The log contains no key.

import { blobToBase64 } from '../lib/blob';
import { googleErrorDetail, toUserMessage } from '../lib/errors';
import type { Settings } from '../settings/settingsStore';
import { checkModel, createGeminiClient, deleteUpload, listModels, streamText, uploadAudio } from './gemini';
import { buildTranscriptionPrompt } from './prompt';
import { TRANSCRIPT_SCHEMA } from './schema';

export interface DiagnosisLine {
  ok: boolean | null; // null = information
  text: string;
}


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

  // The path short recordings take: audio inside the request, no upload.
  t = performance.now();
  try {
    let first = 0;
    const data = await blobToBase64(testToneWav());
    const text = await streamText(ai, model, 'Was hörst du? Antworte in einem kurzen Satz.', { data, mimeType: 'audio/wav' }, {
      onProgress: () => (first ||= performance.now()),
    });
    const firstAfter = first ? ` · erster Text nach ${((first - t) / 1000).toFixed(1).replace('.', ',')} s` : '';
    log({ ok: Boolean(text), text: `Kurze Aufnahme, direkt mitgeschickt (${secs(t)}${firstAfter}): ${text ? snippet(text) : 'leer'}` });
  } catch (e) {
    log({ ok: false, text: `Kurze Aufnahme, direkt mitgeschickt (${secs(t)}): ${clean(e)}` });
  }

  // The path long recordings take: upload to the Files API first.
  t = performance.now();
  let upload;
  try {
    upload = await uploadAudio(ai, testToneWav(), 'audio/wav');
    log({ ok: true, text: `Testton hochgeladen (${secs(t)})` });
  } catch (e) {
    log({ ok: false, text: `Hochladen: ${clean(e)}` });
    return;
  }

  try {
    t = performance.now();
    let first = 0;
    try {
      const text = await streamText(ai, model, 'Was hörst du? Antworte in einem kurzen Satz.', upload, {
        onProgress: () => (first ||= performance.now()),
      });
      const firstAfter = first ? ` · erster Text nach ${((first - t) / 1000).toFixed(1).replace('.', ',')} s` : '';
      log({ ok: Boolean(text), text: `Lange Aufnahme, über Upload (${secs(t)}${firstAfter}): ${text ? snippet(text) : 'leer'}` });
    } catch (e) {
      log({ ok: false, text: `Lange Aufnahme, über Upload (${secs(t)}): ${clean(e)}` });
    }

    t = performance.now();
    try {
      const text = await streamText(ai, model, buildTranscriptionPrompt({ glossary: [], removeFillers: true }), upload, { jsonSchema: TRANSCRIPT_SCHEMA });
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
  } finally {
    await deleteUpload(ai, upload.name);
  }
}
