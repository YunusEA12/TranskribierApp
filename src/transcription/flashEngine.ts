// Engine A: multimodal flash model, transcript via prompt + JSON schema, title in the same request.

import type { GoogleGenAI } from '@google/genai';
import type { TranscriptResult } from '../types';
import type { AudioInput, TranscribeContext, TranscribeOptions, TranscriptionEngine } from './engine';
import { streamText } from './gemini';
import { buildTranscriptionPrompt } from './prompt';
import { TRANSCRIPT_SCHEMA, TranscriptValidationError, validateTranscriptResult } from './schema';

export class FlashEngine implements TranscriptionEngine {
  constructor(
    private readonly ai: GoogleGenAI,
    readonly model: string,
  ) {}

  async transcribe(audio: AudioInput, options: TranscribeOptions, context: TranscribeContext = {}): Promise<TranscriptResult> {
    const text = await streamText(this.ai, this.model, buildTranscriptionPrompt(options), audio, {
      jsonSchema: TRANSCRIPT_SCHEMA,
      onProgress: context.onProgress,
    });
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new TranscriptValidationError(
        'Die Antwort von Gemini ist unvollständig (vermutlich zu lang). Bei sehr langen Aufnahmen hilft vorerst nur Kürzen.',
      );
    }
    return validateTranscriptResult(parsed);
  }
}
