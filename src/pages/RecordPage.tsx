import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { db } from '../db/db';
import { toUserMessage } from '../lib/errors';
import { formatClock } from '../lib/time';
import { importAudioFile } from '../recording/importAudio';
import { interruptedSessions, Recorder, recoverSession, type RecorderState } from '../recording/recorder';
import { hrefFor, navigate } from '../router';
import { missingSettings, useSettings } from '../settings/settingsStore';
import { userFolder } from '../vault/paths';

const recorder = new Recorder(); // module-level: survives page switches during a recording
const BARS = 40;
const SPEAKER_OPTIONS = [undefined, 1, 2, 3, 4, 5] as const;

type Interrupted = Awaited<ReturnType<typeof interruptedSessions>>;

const STATE_TEXT: Record<RecorderState, string> = { idle: 'Bereit', recording: 'Nimmt auf', paused: 'Pausiert' };

export function RecordPage() {
  const settings = useSettings();
  const [state, setState] = useState<RecorderState>(recorder.state);
  const [elapsed, setElapsed] = useState(recorder.elapsedSec);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [speakerCount, setSpeakerCount] = useState<number | undefined>(undefined);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [interrupted, setInterrupted] = useState<Interrupted>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(recorder.elapsedSec);
      setState(recorder.state);
      if (recorder.state === 'recording') setLevels((l) => [...l.slice(1), recorder.level()]);
    }, 90);
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

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Mikrofon-Zugriff wurde verweigert. In den Browser-Einstellungen erlauben.' : toUserMessage(e));
    } finally {
      setBusy(false);
      setState(recorder.state);
    }
  };

  const start = () =>
    run(async () => {
      setLevels(Array(BARS).fill(0));
      await recorder.start(speakerCount);
    });
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
      await importAudioFile(file, speakerCount);
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

  const active = state !== 'idle';

  return (
    <div className="page">
      <div className="page-head">
        <h1>Aufnahme</h1>
      </div>

      {missingSettings(settings).length > 0 && (
        <a className="banner" href={hrefFor.settings}>
          <Icon name="key" />
          <span>Noch kein API-Key eingetragen. Aufnehmen geht trotzdem, transkribiert wird danach.</span>
          <span className="go">Eintragen</span>
        </a>
      )}
      {missingSettings(settings).length === 0 && !userFolder(settings.userName) && (
        <a className="banner" href={hrefFor.settings}>
          <Icon name="person" />
          <span>Wähle deinen Namen, damit deine Notizen in Obsidian in deinem eigenen Ordner landen.</span>
          <span className="go">Wählen</span>
        </a>
      )}

      {interrupted.map((s) => (
        <div key={s.sessionId} className="card stack">
          <div className="row">
            <Icon name="alert" />
            <b>Unterbrochene Aufnahme gefunden</b>
          </div>
          <small>
            {new Date(s.startedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })} · {formatClock(s.elapsedSec)}
          </small>
          <div className="actions">
            <button className="btn-vault" onClick={() => void recover(s.sessionId)} disabled={busy}>
              Wiederherstellen
            </button>
            <button className="btn-danger" onClick={() => dropInterrupted(s.sessionId)} disabled={busy}>
              Löschen
            </button>
          </div>
        </div>
      ))}

      <section className={`card recorder ${state}`} aria-label="Rekorder">
        <div className="meter" aria-hidden="true">
          {levels.map((l, i) => (
            <span key={i} style={{ height: `${Math.max(6, l * 100)}%` }} />
          ))}
        </div>
        <div className="clock" role="timer" aria-live="off">
          {formatClock(elapsed)}
        </div>
        <div className="rec-state">{STATE_TEXT[state]}</div>

        <div className="controls">
          {active && (
            <div>
              {state === 'recording' ? (
                <button className="round-btn" onClick={() => recorder.pause()} aria-label="Pause">
                  <Icon name="pause" />
                </button>
              ) : (
                <button className="round-btn" onClick={() => recorder.resume()} aria-label="Weiter">
                  <Icon name="play" />
                </button>
              )}
              <span className="caption">{state === 'recording' ? 'Pause' : 'Weiter'}</span>
            </div>
          )}
          <div>
            <button
              className={`rec-btn ${active ? 'stop' : ''}`}
              onClick={() => void (active ? stop() : start())}
              disabled={busy}
              aria-label={active ? 'Stoppen und transkribieren' : 'Aufnahme starten'}
            />
            <span className="caption">{active ? 'Fertig' : 'Aufnehmen'}</span>
          </div>
          {active && (
            <div>
              <button className="round-btn danger" onClick={discard} disabled={busy} aria-label="Verwerfen">
                <Icon name="trash" />
              </button>
              <span className="caption">Verwerfen</span>
            </div>
          )}
        </div>
      </section>

      {active ? (
        <p className="muted" style={{ textAlign: 'center', fontSize: '0.88rem' }}>
          Der Bildschirm bleibt an. App nicht schließen oder wechseln, sonst stoppt das iPhone die Aufnahme.
        </p>
      ) : (
        <>
          <div className="stack">
            <span className="eyebrow">Wie viele sprechen?</span>
            <div className="chips" role="group" aria-label="Erwartete Sprecher">
              {SPEAKER_OPTIONS.map((n) => (
                <button key={n ?? 'auto'} className="chip" aria-pressed={speakerCount === n} onClick={() => setSpeakerCount(n)}>
                  {n === undefined ? 'Auto' : n === 5 ? '5+' : n}
                </button>
              ))}
            </div>
          </div>

          <button className="import-card" onClick={() => fileInput.current?.click()} disabled={busy}>
            <span className="icon-wrap">
              <Icon name="upload" />
            </span>
            <span>
              <b>Audiodatei importieren</b>
              <small>Zum Beispiel aus der Sprachmemo-App. Für lange Meetings der sichere Weg.</small>
            </span>
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
        </>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
