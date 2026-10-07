import type { GoogleGenAI } from '@google/genai';
import type { Settings } from '../settings/settingsStore';
import type { TranscriptionEngine } from './engine';
import { FallbackEngine } from './fallbackEngine';
import { FlashEngine } from './flashEngine';
import { TranscribeEngine } from './transcribeEngine';

export function createEngine(ai: GoogleGenAI, s: Settings): TranscriptionEngine {
  const primary =
    s.engine === 'transcribe'
      ? new TranscribeEngine(ai, s.transcribeModel.trim(), s.flashModel.trim())
      : new FlashEngine(ai, s.flashModel.trim());
  const fallbackModel = s.fallbackModel.trim();
  if (!fallbackModel || fallbackModel === primary.model) return primary;
  return new FallbackEngine(primary, new FlashEngine(ai, fallbackModel));
}
