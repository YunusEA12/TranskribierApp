import { UserError } from './errors';

/** Rejects even when a browser/SDK request ignores abort. Late results are never applied. */
export async function boundedRequest<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, message: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      reject(signal?.reason ?? new UserError('Verarbeitung angehalten. Die Aufnahme bleibt gespeichert.'));
      controller.abort();
    };
    timer = setTimeout(() => {
      reject(new UserError(message));
      controller.abort();
    }, timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
  });
  try {
    if (signal?.aborted) cancel();
    return await Promise.race([signal?.aborted ? interrupted : run(controller.signal), interrupted]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

/** Waits `ms`; rejects with the signal's reason as soon as it aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
