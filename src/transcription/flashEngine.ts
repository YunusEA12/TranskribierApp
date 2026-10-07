// Engine A: multimodal flash model, transcript via prompt + JSON schema, title in the same request.

import type { GoogleGenAI } from '@google/genai';
import type { UploadedAudio } from '../jobs/queue';
import type { TranscriptResult } from '../types';
import type { TranscribeContext, TranscribeOptions, TranscriptionEngine } from './engine';
import { outputText, runInBackground } from './gemini';
import { buildTranscriptionPrompt } from './prompt';
import { TRANSCRIPT_SCHEMA, TranscriptValidationError, validateTranscriptResult } from './schema';

export class FlashEngine implements TranscriptionEngine {
  constructor(
    private readonly ai: GoogleGenAI,
    readonly model: string,
  ) {}

  async transcribe(audio: UploadedAudio, options: TranscribeOptions, context: TranscribeContext = {}): Promise<TranscriptResult> {
    const res = await runInBackground(
      this.ai,
      {
        model: this.model,
        input: [
          { type: 'text', text: buildTranscriptionPrompt(options) },
          { type: 'audio', uri: audio.uri, mime_type: audio.mimeType },
        ],
        response_format: { type: 'text', mime_type: 'application/json', schema: TRANSCRIPT_SCHEMA },
      },
      {
        resumeId: context.resume?.model === this.model ? context.resume.id : undefined,
        onStarted: (id) => context.onStarted?.(id, this.model) ?? Promise.resolve(),
      },
    );
    const text = outputText(res);
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
