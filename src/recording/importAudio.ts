// Import of existing audio files, e.g. from the phone's voice memo app (works with a locked screen).

import { enqueueAudio } from '../jobs/runner';
import { UserError } from '../lib/errors';

const EXT_MIME: Record<string, string> = {
  m4a: 'audio/m4a',
  mp4: 'audio/mp4',
  mp3: 'audio/mp3',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  webm: 'audio/webm',
  aac: 'audio/aac',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
};

/** The file's own type, or one derived from the extension when the browser reports none. */
export function mimeTypeOf(file: File): string {
  const reported = file.type.split(';')[0]!.trim();
  if (reported && reported !== 'application/octet-stream') return reported;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? '';
}

function probeDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    const timer = setTimeout(() => done(0), 10000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      done(audio.duration);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done(0);
    };
    audio.src = url;
  });
}

export async function importAudioFile(file: File, speakerCount?: number): Promise<string> {
  const mimeType = mimeTypeOf(file);
  if (!mimeType.startsWith('audio/')) {
    throw new UserError(`Dateityp wird nicht erkannt (${file.type || file.name}). Bitte eine Audiodatei wählen.`);
  }
  const durationSec = await probeDuration(file);
  // lastModified is usually the end of the recording; fall back to now.
  const end = file.lastModified || Date.now();
  return enqueueAudio({
    blob: file,
    mimeType,
    source: 'import',
    recordedAt: end - durationSec * 1000,
    durationSec,
    fileName: file.name,
    speakerCount,
  });
}
