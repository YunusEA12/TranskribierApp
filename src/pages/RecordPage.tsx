import { useEffect, useRef, useState } from 'react';
import { db } from '../db/db';
import { toUserMessage } from '../lib/errors';
import { formatClock } from '../lib/time';
import { importAudioFile } from '../recording/importAudio';
import { interruptedSessions, Recorder, recoverSession, type RecorderState } from '../recording/recorder';
import { hrefFor, navigate } from '../router';

const recorder = new Recorder(); // module-level: survives page switches during a recording

type Interrupted = Awaited<ReturnType<typeof interruptedSessions>>;

export function RecordPage() {
  const [state, setState] = useState<RecorderState>(recorder.state);
  const [elapsed, setElapsed] = useState(recorder.elapsedSec);
  const [speakerCount, setSpeakerCount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [interrupted, setInterrupted] = useState<Interrupted>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(recorder.elapsedSec);
      setState(recorder.state);
    }, 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void interruptedSessions(recorder).then(setInterrupted);
  }, []);

  // Warn before closing the tab mid-recording; the chunks so far are saved either way.
  useEffect(() => {
    if (state === 'idle') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  const count = () => {
    const n = parseInt(speakerCount, 10);
    return n >= 1 && n <= 10 ? n : undefined;
  };

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Mikrofon-Zugriff wurde verweigert.' : toUserMessage(e));
    } finally {
      setBusy(false);
      setState(recorder.state);
    }
  };

  const start = () => run(() => recorder.start(count()));
  const stop = () =>
    run(async () => {
      await recorder.stop();
      navigate(hrefFor.history);
    });
  const discard = () => {
    if (confirm('Aufnahme wirklich verwerfen?')) void run(() => recorder.discard());
  };
  const importFile = (file: File | undefined) => {
    if (!file) return;
    void run(async () => {
      await importAudioFile(file, count());
      navigate(hrefFor.history);
    });
  };
  const recover = (sessionId: string) =>
    run(async () => {
      await recoverSession(sessionId);
      navigate(hrefFor.history);
    });
  const dropInterrupted = (sessionId: string) => {
    if (!confirm('Unterbrochene Aufnahme endgültig löschen?')) return;
    void run(async () => {
      await db.chunks.where('sessionId').equals(sessionId).delete();
      setInterrupted((list) => list.filter((s) => s.sessionId !== sessionId));
    });
  };

  return (
    <div>
      <h1>Aufnahme</h1>

      {interrupted.map((s) => (
        <div key={s.sessionId} className="notice">
          Unterbrochene Aufnahme vom {new Date(s.startedAt).toLocaleString('de-DE')} ({formatClock(s.elapsedSec)}) gefunden.
          <div className="actions">
            <button onClick={() => void recover(s.sessionId)} disabled={busy}>
              Wiederherstellen
            </button>
            <button onClick={() => dropInterrupted(s.sessionId)} disabled={busy}>
              Löschen
            </button>
          </div>
        </div>
      ))}

      <label>
        Erwartete Sprecher (optional)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          value={speakerCount}
          disabled={state !== 'idle'}
          onChange={(e) => setSpeakerCount(e.target.value)}
        />
      </label>

      <div className={`timer ${state}`}>{formatClock(elapsed)}</div>

      {state === 'idle' ? (
        <div className="actions big">
          <button className="primary" onClick={() => void start()} disabled={busy}>
            ● Aufnahme starten
          </button>
          <button onClick={() => fileInput.current?.click()} disabled={busy}>
            Audiodatei importieren
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.ogg,.opus,.webm,.aac,.flac"
            hidden
            onChange={(e) => {
              importFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <div className="actions big">
          {state === 'recording' ? (
            <button onClick={() => recorder.pause()}>❚❚ Pause</button>
          ) : (
            <button onClick={() => recorder.resume()}>▶ Weiter</button>
          )}
          <button className="primary" onClick={() => void stop()} disabled={busy}>
            ■ Stopp und transkribieren
          </button>
          <button onClick={discard} disabled={busy}>
            Verwerfen
          </button>
        </div>
      )}

      {state !== 'idle' && (
        <p>
          <small>Bildschirm bleibt an. App nicht schließen oder wechseln; auf dem iPhone stoppt sonst die Aufnahme.</small>
        </p>
      )}
      {state === 'idle' && (
        <p>
          <small>Für lange Meetings ist die Sprachmemo-App des Handys robuster: dort aufnehmen und die Datei hier importieren.</small>
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
