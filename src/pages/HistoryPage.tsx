import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { db } from '../db/db';
import type { Job, Step } from '../jobs/queue';
import { discardJob, retryJob } from '../jobs/runner';
import { toUserMessage } from '../lib/errors';
import { formatClock, localDate } from '../lib/time';
import { hrefFor } from '../router';
import { missingSettings, storageConnected, useSettings } from '../settings/settingsStore';
import { parseTranscriptPath } from '../vault/paths';
import { clientFromSettings, listTranscripts } from '../vault/vaultRepo';

const STEPS: Array<{ step: Step; label: string }> = [
  { step: 'uploading', label: 'Hochladen' },
  { step: 'transcribing', label: 'Transkribieren' },
  { step: 'saving', label: 'Speichern' },
];
const FILTERS = ['Alle', 'Yunus', 'Calvin'] as const;

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

/** Current time, refreshed every second (for "running for …"). 0 until mounted. */
function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function StepTimer({ since }: { since?: number }) {
  const now = useNow();
  if (!since || !now) return null;
  return <span className="step-timer">läuft seit {formatClock((now - since) / 1000)}</span>;
}

function TranscribingInfo({ job }: { job: Job }) {
  return (
    <small>
      {job.progressChars
        ? `Gemini schreibt das Transkript … ${job.progressChars.toLocaleString('de-DE')} Zeichen.`
        : 'Gemini hört sich die Aufnahme an …'}{' '}
      Bitte die App geöffnet lassen, bis es fertig ist.
    </small>
  );
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
      {job.status !== 'failed' && job.status !== 'recorded' && <StepTimer since={job.stepStartedAt} />}
      <div className="steps">
        {STEPS.map((s) => (
          <div key={s.step} className={stepClass(job, s.step)}>
            {s.label}
          </div>
        ))}
      </div>
      {job.status === 'recorded' && <small>{waitingReason || 'Startet gleich …'}</small>}
      {job.status === 'uploading' && <small>Bitte die App geöffnet lassen, bis das Hochladen fertig ist.</small>}
      {job.status === 'transcribing' && <TranscribingInfo job={job} />}
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

/** One row of the shared history: a transcript made on this phone, or one from the shared storage. */
interface Item {
  key: string;
  href: string;
  title: string;
  date: string;
  time: string;
  user: string;
  durationMin?: number;
  speakerCount?: number;
  pendingUpload: boolean;
}

function TranscriptCard({ item }: { item: Item }) {
  return (
    <li>
      <a className="card tcard" href={item.href}>
        <span className="title">{item.title}</span>
        <span className="meta">
          {item.user && <span className={`who-chip u-${item.user.toLowerCase()}`}>{item.user}</span>}
          <span>{item.time}</span>
          {item.durationMin !== undefined && <span>{item.durationMin} min</span>}
          {item.speakerCount !== undefined && <span>{item.speakerCount} Sprecher</span>}
          {item.pendingUpload && <span className="pill warn">Noch nicht im Speicher</span>}
        </span>
      </a>
    </li>
  );
}

export function HistoryPage() {
  const settings = useSettings();
  const connected = storageConnected(settings);
  const jobs = useLiveQuery(() => db.jobs.orderBy('recordedAt').reverse().filter((j) => j.status !== 'done').toArray(), []);
  const local = useLiveQuery(() => db.transcripts.toArray(), []);
  const remote = useLiveQuery(() => db.remote.toArray(), []);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Alle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError('');
    try {
      const list = await listTranscripts(clientFromSettings(settings));
      await db.transaction('rw', db.remote, async () => {
        await db.remote.clear();
        await db.remote.bulkPut(list);
      });
    } catch (e) {
      setError(toUserMessage(e, 'github'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, settings.githubToken, settings.vaultRepo, settings.vaultBranch]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const missing = missingSettings(settings);
  const waitingReason = missing.length
    ? `Wartet auf die Einstellungen: ${missing.join(', ')}`
    : !navigator.onLine
      ? 'Offline. Startet automatisch, sobald du wieder online bist.'
      : '';

  // Transcripts from this phone win over their copy in the storage (they have audio and duration).
  const byPath = new Map<string, Item>();
  for (const r of remote ?? []) {
    byPath.set(r.path, { key: r.path, href: hrefFor.transcript(`r:${r.path}`), title: r.title, date: r.date, time: r.time, user: r.user, pendingUpload: false });
  }
  for (const t of local ?? []) {
    byPath.set(t.path, {
      key: t.path,
      href: hrefFor.transcript(t.id),
      title: t.title,
      date: t.date,
      time: t.time,
      user: parseTranscriptPath(t.path)?.user ?? '',
      durationMin: t.durationMin,
      speakerCount: t.speakerCount,
      pendingUpload: !t.githubPath,
    });
  }

  const q = query.trim().toLowerCase();
  const items = [...byPath.values()]
    .filter((i) => filter === 'Alle' || i.user === filter)
    .filter((i) => !q || i.title.toLowerCase().includes(q))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const groups = new Map<string, Item[]>();
  for (const i of items) groups.set(i.date, [...(groups.get(i.date) ?? []), i]);

  const nothingYet = byPath.size === 0 && jobs?.length === 0 && !loading;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Verlauf</h1>
        {connected && (
          <button className="btn-small btn-ghost" onClick={() => void refresh()} disabled={loading}>
            <Icon name="retry" size={18} />
            {loading ? 'Lädt …' : 'Aktualisieren'}
          </button>
        )}
      </div>

      {!connected && (
        <a className="banner" href={hrefFor.settings}>
          <Icon name="vault" />
          <span>Noch nicht mit dem gemeinsamen Speicher verbunden. Dann seht ihr hier beide alles.</span>
          <span className="go">Verbinden</span>
        </a>
      )}

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

      {error && (
        <p className="error-text">
          {error}{' '}
          <button className="btn-small btn-ghost" onClick={() => void refresh()}>
            Erneut versuchen
          </button>
        </p>
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

      {byPath.size > 0 && (
        <>
          <div className="chips" role="group" aria-label="Filter">
            {FILTERS.map((f) => (
              <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>
          <label className="search">
            <Icon name="search" size={18} />
            <input id="history-search" type="search" placeholder="Titel suchen" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </>
      )}

      {[...groups.entries()].map(([date, list]) => (
        <section key={date} className="stack">
          <span className="eyebrow day">{dayLabel(date)}</span>
          <ul className="cards">
            {list.map((i) => (
              <TranscriptCard key={i.key} item={i} />
            ))}
          </ul>
        </section>
      ))}

      {byPath.size > 0 && items.length === 0 && <p className="muted">Nichts gefunden.</p>}
    </div>
  );
}
