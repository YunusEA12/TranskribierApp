import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { SaveToObsidianButton } from '../components/SaveToObsidianButton';
import { db, type TranscriptRecord } from '../db/db';
import { discardJob } from '../jobs/runner';
import { audioExtension, downloadBlob } from '../lib/download';
import { hrefFor, navigate } from '../router';
import { useSettings } from '../settings/settingsStore';
import type { Transcript } from '../types';
import { parseMarkdown } from '../vault/markdown';

const speakerClass = (index: number) => `sp-${(index % 5) + 1}`;

function VaultBox({ record }: { record: TranscriptRecord }) {
  const settings = useSettings();
  return (
    <div className="card vault-box">
      <SaveToObsidianButton record={record} />
      <span className="note">
        {record.obsidianAt
          ? `An Obsidian übergeben am ${new Date(record.obsidianAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}. Erneut speichern überschreibt die Notiz.`
          : 'Öffnet Obsidian und legt die Notiz an.'}
      </span>
      <span className="note">
        Vault „{settings.sharedVault}“ · Ordner {record.path.slice(0, record.path.lastIndexOf('/'))}
      </span>
    </div>
  );
}

export function TranscriptPage({ id }: { id: string }) {
  // null = not found, undefined = still loading
  const record = useLiveQuery(async () => (await db.transcripts.get(id)) ?? null, [id]);
  const audio = useLiveQuery(() => db.audio.get(id), [id]);
  const [copied, setCopied] = useState(false);

  if (record === undefined) return null;
  if (record === null) {
    return (
      <div className="page">
        <a className="back" href={hrefFor.history}>
          <Icon name="back" size={20} /> Verlauf
        </a>
        <p className="muted">Transkript nicht gefunden.</p>
      </div>
    );
  }

  let transcript: Transcript | null = null;
  try {
    transcript = parseMarkdown(record.markdown);
  } catch {
    transcript = null;
  }
  const speakerIds = transcript ? Object.keys(transcript.meta.speakers) : [];
  const fileName = record.path.slice(record.path.lastIndexOf('/') + 1);

  const copy = async () => {
    await navigator.clipboard.writeText(record.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const file = () => new File([record.markdown], fileName, { type: 'text/markdown' });
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file()] });
  const share = async () => {
    try {
      await navigator.share({ files: [file()], title: record.title });
    } catch {
      // Cancelled by the user.
    }
  };
  const remove = async () => {
    if (!confirm('Transkript und Audio auf diesem Gerät löschen? Eine Notiz in Obsidian bleibt erhalten.')) return;
    await discardJob(id);
    navigate(hrefFor.history);
  };

  return (
    <div className="page">
      <a className="back" href={hrefFor.history}>
        <Icon name="back" size={20} /> Verlauf
      </a>

      <div className="stack">
        <h1>{record.title}</h1>
        <div className="meta-chips">
          <span className="pill">
            {new Date(`${record.date}T12:00`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}, {record.time}
          </span>
          <span className="pill">{record.durationMin} min</span>
          {transcript?.meta.language && <span className="pill">{transcript.meta.language.toUpperCase()}</span>}
          {transcript?.meta.model && <span className="pill">{transcript.meta.model}</span>}
        </div>
      </div>

      <VaultBox record={record} />

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
          {record.markdown}
        </pre>
      )}

      <div className="danger-zone">
        <button className="btn-small btn-danger" onClick={() => void remove()}>
          <Icon name="trash" size={18} />
          Vom Gerät löschen
        </button>
      </div>
    </div>
  );
}
