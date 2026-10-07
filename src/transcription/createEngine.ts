import type { GoogleGenAI } from '@google/genai';
import type { Settings } from '../settings/settingsStore';
import type { TranscriptionEngine } from './engine';
import { FlashEngine } from './flashEngine';
import { TranscribeEngine } from './transcribeEngine';

export function createEngine(ai: GoogleGenAI, s: Settings): TranscriptionEngine {
  return s.engine === 'transcribe'
    ? new TranscribeEngine(ai, s.transcribeModel.trim(), s.flashModel.trim())
    : new FlashEngine(ai, s.flashModel.trim());
}
