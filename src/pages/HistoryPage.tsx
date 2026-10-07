import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../db/db';
import type { Job, JobStatus } from '../jobs/queue';
import { discardJob, retryJob } from '../jobs/runner';
import { toUserMessage } from '../lib/errors';
import { formatClock } from '../lib/time';
import { hrefFor } from '../router';
import { missingSettings, useSettings } from '../settings/settingsStore';
import { clientFromSettings, listTranscripts } from '../vault/vaultRepo';

const STATUS_TEXT: Record<JobStatus, string> = {
  recorded: 'Wartet',
  uploading: 'Wird hochgeladen …',
  transcribing: 'Wird transkribiert …',
  saving: 'Wird gespeichert …',
  done: 'Fertig',
  failed: 'Fehler',
};

function JobItem({ job, waitingReason }: { job: Job; waitingReason: string }) {
  const [busy, setBusy] = useState(false);
  const label = job.fileName ?? `Aufnahme ${new Date(job.recordedAt).toLocaleString('de-DE')}`;
  return (
    <li className={`job ${job.status}`}>
      <div>
        <strong>{label}</strong> <small>({formatClock(job.durationSec)})</small>
      </div>
      <div>
        {STATUS_TEXT[job.status]}
        {job.status === 'recorded' && waitingReason && ` – ${waitingReason}`}
      </div>
      {job.status === 'failed' && (
        <>
          <div className="error">{job.error}</div>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void retryJob(job.id).finally(() => setBusy(false));
              }}
            >
              Erneut versuchen
            </button>
            <button
              disabled={busy}
              onClick={() => {
                if (confirm('Aufnahme und Fortschritt löschen? Das Audio ist danach weg.')) void discardJob(job.id);
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

export function HistoryPage() {
  const settings = useSettings();
  const missing = missingSettings(settings);
  const jobs = useLiveQuery(() => db.jobs.orderBy('recordedAt').reverse().filter((j) => j.status !== 'done').toArray(), []);
  const entries = useLiveQuery(() => db.history.orderBy('date').reverse().toArray(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    if (missing.length) return;
    setLoading(true);
    setError('');
    try {
      const list = await listTranscripts(clientFromSettings(settings), settings.vaultBaseDir);
      await db.transaction('rw', db.history, async () => {
        await db.history.clear();
        await db.history.bulkPut(list);
      });
    } catch (e) {
      setError(toUserMessage(e, 'github'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.githubToken, settings.vaultRepo, settings.vaultBranch, settings.vaultBaseDir]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const waitingReason = missing.length
    ? `Einstellungen fehlen: ${missing.join(', ')}`
    : typeof navigator !== 'undefined' && !navigator.onLine
      ? 'offline, startet automatisch'
      : '';

  const q = query.trim().toLowerCase();
  const sorted = (entries ?? [])
    .filter((e) => !q || e.title.toLowerCase().includes(q) || e.date.includes(q))
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  return (
    <div>
      <h1>Verlauf</h1>
      {missing.length > 0 && (
        <p className="notice">
          Einstellungen unvollständig ({missing.join(', ')}). <a href={hrefFor.settings}>Zu den Einstellungen</a>
        </p>
      )}

      {jobs && jobs.length > 0 && (
        <>
          <h2>In Arbeit</h2>
          <ul className="list">
            {jobs.map((j) => (
              <JobItem key={j.id} job={j} waitingReason={waitingReason} />
            ))}
          </ul>
        </>
      )}

      <h2>Transkripte</h2>
      <div className="actions">
        <input type="search" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button onClick={() => void refresh()} disabled={loading || missing.length > 0}>
          {loading ? 'Lädt …' : 'Aktualisieren'}
        </button>
      </div>
      {error && (
        <p className="error">
          {error} <button onClick={() => void refresh()}>Erneut versuchen</button>
        </p>
      )}
      {sorted.length === 0 && !loading && !error && <p>Noch keine Transkripte.</p>}
      <ul className="list">
        {sorted.map((e) => (
          <li key={e.path}>
            <a href={hrefFor.transcript(e.path)}>
              <small>
                {new Date(`${e.date}T00:00`).toLocaleDateString('de-DE')} {e.time}
              </small>
              <br />
              {e.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
