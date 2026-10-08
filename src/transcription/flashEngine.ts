// Engine A: multimodal flash model, transcript via prompt + JSON schema, title in the same request.
// A long answer can break off (connection lost, stream cut); then the complete part is kept and the rest
// is asked for separately, starting where the kept part ends (PLAN.md 3.5).

import type { GoogleGenAI } from '@google/genai';
import { UserError } from '../lib/errors';
import { formatClock } from '../lib/time';
import type { TranscriptResult } from '../types';
import type { AudioInput, TranscribeContext, TranscribeOptions, TranscriptionEngine } from './engine';
import { StreamCutError, streamText } from './gemini';
import { buildContinuationPrompt, buildTranscriptionPrompt } from './prompt';
import { joinTranscripts, latestStartSec, looksStuck, resumePlan, salvageTranscript } from './resume';
import { TRANSCRIPT_SCHEMA, validateTranscriptResult } from './schema';

/** Breaks in a row that bring no new segment before giving up. A break with progress resets the count. */
const MAX_BREAKS_WITHOUT_PROGRESS = 3;
/** Upper bound for requests per transcription, whatever happens. */
const MAX_REQUESTS = 20;
const STUCK_MESSAGE = 'Gemini ist beim Transkribieren hängen geblieben und hat sich ständig wiederholt. „Erneut versuchen“ macht ab der letzten guten Stelle weiter.';

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function validOrNull(raw: unknown): TranscriptResult | null {
  try {
    return validateTranscriptResult(raw);
  } catch {
    return null;
  }
}

export class FlashEngine implements TranscriptionEngine {
  constructor(
    private readonly ai: GoogleGenAI,
    readonly model: string,
  ) {}

  async transcribe(audio: AudioInput, options: TranscribeOptions, context: TranscribeContext = {}): Promise<TranscriptResult> {
    let partial = context.resumeFrom;
    let breaks = 0;
    for (let request = 1; ; request++) {
      const plan = partial ? resumePlan(partial) : null;
      const prompt = plan ? buildContinuationPrompt(options, plan.kept, formatClock(plan.resumeAtSec)) : buildTranscriptionPrompt(options);
      let text: string;
      let cut: StreamCutError | undefined;
      try {
        text = await streamText(this.ai, this.model, prompt, audio, {
          jsonSchema: TRANSCRIPT_SCHEMA,
          signal: context.signal,
          firstChunkMs: context.firstChunkMs,
          onProgress: (chars, sofar) => context.onProgress?.(chars, latestStartSec(sofar)),
          stopWhen: (sofar) => (looksStuck(sofar) ? STUCK_MESSAGE : undefined),
        });
      } catch (e) {
        if (!(e instanceof StreamCutError)) throw e;
        cut = e;
        text = e.partial;
      }

      const parsed = cut ? undefined : parseJson(text);
      if (parsed !== undefined) {
        if (!plan || !partial) return validateTranscriptResult(parsed);
        const rest = validOrNull(parsed);
        const joined = rest && joinTranscripts(plan.kept, rest, plan.resumeAtSec);
        // An empty or merely repeated continuation would lose the segment asked for again; keep the partial then.
        return validateTranscriptResult(joined && joined.segments.length >= partial.segments.length ? joined : partial);
      }

      // Stopped by the user or the overall time limit: no further requests, nothing more to store.
      context.signal?.throwIfAborted();
      // Broke off, or ended before the JSON was complete (answer too long): keep the complete segments.
      const salvaged = salvageTranscript(text);
      const next = salvaged ? (plan ? joinTranscripts(plan.kept, salvaged, plan.resumeAtSec) : salvaged) : partial;
      if (next && next.segments.length > (partial?.segments.length ?? 0)) {
        partial = next;
        breaks = 0;
        await context.onPartial?.(next);
      } else {
        breaks++;
      }
      if (breaks >= MAX_BREAKS_WITHOUT_PROGRESS || request >= MAX_REQUESTS) {
        throw cut ?? new UserError('Die Antwort von Gemini ist unvollständig. „Erneut versuchen“ macht dort weiter, wo es abgebrochen ist.');
      }
      await context.beforeRetry?.();
      context.signal?.throwIfAborted();
    }
  }
}
