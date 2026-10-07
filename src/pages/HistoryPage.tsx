import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { db, type TranscriptRecord } from '../db/db';
import type { Job, Step } from '../jobs/queue';
import { discardJob, retryJob } from '../jobs/runner';
import { formatClock, localDate } from '../lib/time';
import { hrefFor } from '../router';
import { missingSettings, useSettings } from '../settings/settingsStore';

const STEPS: Array<{ step: Step; label: string }> = [
  { step: 'uploading', label: 'Hochladen' },
  { step: 'transcribing', label: 'Transkribieren' },
  { step: 'saving', label: 'Speichern' },
];

function stepClass(job: Job, step: Step): string {
  const order = STEPS.map((s) => s.step);
  const current = job.status === 'failed' ? job.failedStep : job.status === 'recorded' ? undefined : job.status;
  const ci = current ? order.indexOf(current as Step) : -1;
  const i = order.indexOf(step);
  if (job.status === 'failed' && step === job.failedStep) return 'fail';
  if (i < ci) return 'done';
  if (i === ci && job.status !== 'failed') return 'now';
  return '';
}

function JobCard({ job, waitingReason }: { job: Job; waitingReason: string }) {
  const [busy, setBusy] = useState(false);
  const label = job.fileName ?? `Aufnahme ${new Date(job.recordedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`;
  return (
    <li className={`card job ${job.status}`}>
      <div className="head">
        <b>{label}</b>
        <small>{formatClock(job.durationSec)}</small>
      </div>
      <div className="steps">
        {STEPS.map((s) => (
          <div key={s.step} className={stepClass(job, s.step)}>
            {s.label}
          </div>
        ))}
      </div>
      {job.status === 'recorded' && <small>{waitingReason || 'Startet gleich …'}</small>}
      {job.status === 'uploading' && <small>Bitte die App geöffnet lassen, bis das Hochladen fertig ist.</small>}
      {job.status === 'transcribing' && <small>Läuft bei Google weiter. Du kannst die App verlassen und später wiederkommen.</small>}
      {job.status === 'failed' && (
        <>
          <p className="error-text">{job.error}</p>
          <div className="actions">
            <button
              className="btn-small btn-vault"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void retryJob(job.id).finally(() => setBusy(false));
              }}
            >
              <Icon name="retry" size={18} />
              Erneut versuchen
            </button>
            <button
              className="btn-small btn-danger"
              disabled={busy}
              onClick={() => {
                if (confirm('Aufnahme löschen? Das Audio ist danach weg.')) void discardJob(job.id);
              }}
            >
              Verwerfen
            </button>
          </div>
        </>
      )}
    </li>
  );
}

function dayLabel(date: string): string {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date === localDate(today)) return 'Heute';
  if (date === localDate(yesterday)) return 'Gestern';
  return new Date(`${date}T12:00`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function TranscriptCard({ t }: { t: TranscriptRecord }) {
  return (
    <li>
      <a className="card tcard" href={hrefFor.transcript(t.id)}>
        <span className="title">{t.title}</span>
        <span className="meta">
          <span>{t.time}</span>
          <span>{t.durationMin} min</span>
          <span>{t.speakerCount} Sprecher</span>
          {t.obsidianAt ? (
            <span className="pill vault">
              <Icon name="check" size={13} /> In Obsidian
            </span>
          ) : (
            <span className="pill warn">Noch nicht in Obsidian</span>
          )}
        </span>
      </a>
    </li>
  );
}

export function HistoryPage() {
  const settings = useSettings();
  const jobs = useLiveQuery(() => db.jobs.orderBy('recordedAt').reverse().filter((j) => j.status !== 'done').toArray(), []);
  const transcripts = useLiveQuery(() => db.transcripts.orderBy('createdAt').reverse().toArray(), []);
  const [query, setQuery] = useState('');

  const waitingReason = missingSettings(settings).length
    ? 'Wartet auf den API-Key (Einstellungen).'
    : !navigator.onLine
      ? 'Offline. Startet automatisch, sobald du wieder online bist.'
      : '';

  const q = query.trim().toLowerCase();
  const list = (transcripts ?? [])
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.markdown.toLowerCase().includes(q))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const groups = new Map<string, TranscriptRecord[]>();
  for (const t of list) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);

  const nothingYet = transcripts?.length === 0 && jobs?.length === 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Verlauf</h1>
      </div>

      {jobs && jobs.length > 0 && (
        <section className="stack" aria-label="In Arbeit">
          <span className="eyebrow">In Arbeit</span>
          <ul className="cards">
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} waitingReason={waitingReason} />
            ))}
          </ul>
        </section>
      )}

      {nothingYet && (
        <div className="empty">
          <span className="icon-wrap">
            <Icon name="mic" size={30} />
          </span>
          <b>Noch keine Transkripte</b>
          <span>Nimm etwas auf oder importiere eine Audiodatei.</span>
          <a className="btn btn-rec" href={hrefFor.record}>
            Zur Aufnahme
          </a>
        </div>
      )}

      {transcripts && transcripts.length > 0 && (
        <label className="search">
          <Icon name="search" size={18} />
          <input id="history-search" type="search" placeholder="In Titeln und Texten suchen" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}

      {[...groups.entries()].map(([date, items]) => (
        <section key={date} className="stack">
          <span className="eyebrow day">{dayLabel(date)}</span>
          <ul className="cards">
            {items.map((t) => (
              <TranscriptCard key={t.id} t={t} />
            ))}
          </ul>
        </section>
      ))}

      {q && list.length === 0 && <p className="muted">Nichts gefunden.</p>}
    </div>
  );
}
