/**
 * Resolves once the app is in front and online (at once if it already is), after a short pause.
 * iOS cuts connections of apps in the background, so a retry only makes sense when the app is open.
 * Rejects when `signal` aborts, so a stopped job does not wait forever.
 */
export function untilForeground(signal?: AbortSignal, pauseMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason);
    };
    function check() {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('online', check);
      timer = setTimeout(() => {
        cleanup();
        resolve();
      }, pauseMs);
    }
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    document.addEventListener('visibilitychange', check);
    window.addEventListener('online', check);
    check();
  });
}
