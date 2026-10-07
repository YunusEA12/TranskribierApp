// When the main model's quota is used up (HTTP 429, after the SDK's own retries), try a weaker model
// instead of failing. `model` reports the model that actually produced the transcript.

import { HttpError } from '../lib/errors';
import type { TranscriptResult } from '../types';
import type { AudioInput, TranscribeContext, TranscribeOptions, TranscriptionEngine } from './engine';

export function isQuotaError(e: unknown): boolean {
  return e instanceof HttpError && e.status === 429;
}

export class FallbackEngine implements TranscriptionEngine {
  model: string;

  constructor(
    private readonly primary: TranscriptionEngine,
    private readonly fallback: TranscriptionEngine,
  ) {
    this.model = primary.model;
  }

  async transcribe(audio: AudioInput, options: TranscribeOptions, context: TranscribeContext = {}): Promise<TranscriptResult> {
    try {
      const result = await this.primary.transcribe(audio, options, context);
      this.model = this.primary.model;
      return result;
    } catch (e) {
      if (!isQuotaError(e)) throw e;
      console.warn(`Quota exhausted for ${this.primary.model}, falling back to ${this.fallback.model}`);
      const result = await this.fallback.transcribe(audio, options, context);
      this.model = this.fallback.model;
      return result;
    }
  }
}
