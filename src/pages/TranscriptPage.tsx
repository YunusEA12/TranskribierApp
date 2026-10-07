import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { db, type TranscriptRecord } from '../db/db';
import { discardJob } from '../jobs/runner';
import { audioExtension, downloadBlob } from '../lib/download';
import { toUserMessage } from '../lib/errors';
import { hrefFor, navigate } from '../router';
import { getSettings } from '../settings/settingsStore';
import type { Transcript } from '../types';
import { parseMarkdown } from '../vault/markdown';
import { parseTranscriptPath } from '../vault/paths';
import { clientFromSettings, readTranscript } from '../vault/vaultRepo';

const speakerClass = (index: number) => `sp-${(index % 5) + 1}`;

const Back = () => (
  <a className="back" href={hrefFor.history}>
    <Icon name="back" size={20} /> Verlauf
  </a>
);

/** `id` is a local transcript id, or "r:<path>" for a transcript that is only in the shared storage. */
export function TranscriptPage({ id }: { id: string }) {
  const remotePath = id.startsWith('r:') ? id.slice(2) : null;
  // null = not found, undefined = still loading
  const local = useLiveQuery(
    async () => (remotePath ? await db.transcripts.where('path').equals(remotePath).first() : await db.transcripts.get(id)) ?? null,
    [id],
  );
  const [remoteText, setRemoteText] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadRemote = useCallback(async () => {
    if (!remotePath) return;
    setError('');
    try {
      const cached = await db.remoteFiles.get(remotePath);
      const entry = await db.remote.get(remotePath);
      if (cached) setRemoteText(cached.text);
      if (cached && entry && cached.sha === entry.sha) return;
      const file = await readTranscript(clientFromSettings(getSettings()), remotePath);
      if (!file) {
        if (!cached) setError('Dieses Transkript gibt es im Speicher nicht mehr.');
        return;
      }
      await db.remoteFiles.put({ path: remotePath, sha: file.sha, text: file.text });
      setRemoteText(file.text);
    } catch (e) {
      setError(toUserMessage(e, 'github'));
    }
  }, [remotePath]);

  useEffect(() => {
    if (local === null) void loadRemote();
  }, [local, loadRemote]);

  if (local === undefined) return null;
  if (local) return <TranscriptView markdown={local.markdown} path={local.path} record={local} />;
  if (remotePath && remoteText !== null) return <TranscriptView markdown={remoteText} path={remotePath} />;

  return (
    <div className="page">
      <Back />
      {error ? (
        <p className="error-text">
          {error}{' '}
          <button className="btn-small btn-ghost" onClick={() => void loadRemote()}>
            Erneut versuchen
          </button>
        </p>
      ) : remotePath ? (
        <p className="muted">Lädt …</p>
      ) : (
        <p className="muted">Transkript nicht gefunden.</p>
      )}
    </div>
  );
}

function TranscriptView({ markdown, path, record }: { markdown: string; path: string; record?: TranscriptRecord }) {
  const audio = useLiveQuery(() => (record ? db.audio.get(record.id) : undefined), [record?.id]);
  const [copied, setCopied] = useState(false);

  let transcript: Transcript | null = null;
  try {
    transcript = parseMarkdown(markdown);
  } catch {
    transcript = null;
  }
  const info = parseTranscriptPath(path);
  const title = transcript?.meta.title || info?.title || 'Transkript';
  const date = transcript?.meta.date || info?.date || '';
  const time = transcript?.meta.time || info?.time || '';
  const speakerIds = transcript ? Object.keys(transcript.meta.speakers) : [];
  const fileName = path.slice(path.lastIndexOf('/') + 1);

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const file = () => new File([markdown], fileName, { type: 'text/markdown' });
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file()] });
  const share = async () => {
    try {
      await navigator.share({ files: [file()], title });
    } catch {
      // Cancelled by the user.
    }
  };
  const remove = async () => {
    if (!record) return;
    if (!confirm('Transkript und Audio auf diesem Handy löschen? Die Kopie im gemeinsamen Speicher bleibt erhalten.')) return;
    await discardJob(record.id);
    navigate(hrefFor.history);
  };

  return (
    <div className="page">
      <Back />

      <div className="stack">
        <h1>{title}</h1>
        <div className="meta-chips">
          {info?.user && <span className={`who-chip u-${info.user.toLowerCase()}`}>{info.user}</span>}
          {date && (
            <span className="pill">
              {new Date(`${date}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}, {time}
            </span>
          )}
          {transcript && <span className="pill">{transcript.meta.durationMin} min</span>}
          {transcript?.meta.language && <span className="pill">{transcript.meta.language.toUpperCase()}</span>}
          {transcript?.meta.model && <span className="pill">{transcript.meta.model}</span>}
          {record &&
            (record.githubPath ? (
              <span className="pill ok">
                <Icon name="check" size={13} /> Im Speicher
              </span>
            ) : (
              <span className="pill warn">Noch nicht im Speicher</span>
            ))}
        </div>
      </div>

      <div className="actions">
        <button className="btn-small btn-ghost" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} size={18} />
          {copied ? 'Kopiert' : 'Kopieren'}
        </button>
        {canShare && (
          <button className="btn-small btn-ghost" onClick={() => void share()}>
            <Icon name="share" size={18} />
            Teilen
          </button>
        )}
        <button className="btn-small btn-ghost" onClick={() => downloadBlob(file(), fileName)}>
          <Icon name="download" size={18} />
          .md
        </button>
        {audio && (
          <button className="btn-small btn-ghost" onClick={() => downloadBlob(audio.blob, fileName.replace(/\.md$/, `.${audioExtension(audio.mimeType)}`))}>
            <Icon name="download" size={18} />
            Audio
          </button>
        )}
      </div>

      {transcript ? (
        <section className="card stack">
          <div className="speakers">
            {speakerIds.map((sid, i) => (
              <span key={sid} className={speakerClass(i)}>
                <span className="sp-dot" />
                <span className="sp">{transcript.meta.speakers[sid]}</span>
              </span>
            ))}
          </div>
          <div>
            {transcript.segments.map((s, i) => {
              const index = speakerIds.indexOf(s.speaker);
              return (
                <div key={i} className="segment">
                  <span className="ts">{s.start}</span>
                  <div>
                    <div className={`who sp ${speakerClass(index < 0 ? 0 : index)}`}>{transcript.meta.speakers[s.speaker] ?? s.speaker}</div>
                    <p>{s.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <pre className="card" style={{ whiteSpace: 'pre-wrap' }}>
          {markdown}
        </pre>
      )}

      {record && (
        <div className="danger-zone">
          <button className="btn-small btn-danger" onClick={() => void remove()}>
            <Icon name="trash" size={18} />
            Vom Handy löschen
          </button>
        </div>
      )}
    </div>
  );
}
