import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState } from 'react';
import { db } from '../db/db';
import { audioExtension, downloadBlob } from '../lib/download';
import { toUserMessage } from '../lib/errors';
import { hrefFor } from '../router';
import { useSettings } from '../settings/settingsStore';
import type { Transcript } from '../types';
import { parseMarkdown } from '../vault/markdown';
import { clientFromSettings, readTranscript } from '../vault/vaultRepo';

export function TranscriptPage({ path }: { path: string }) {
  const settings = useSettings();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const job = useLiveQuery(() => db.jobs.filter((j) => j.vaultPath === path).first(), [path]);
  const audio = useLiveQuery(() => (job ? db.audio.get(job.id) : undefined), [job?.id]);

  const load = useCallback(async () => {
    setError('');
    try {
      const cached = await db.files.get(path);
      const listed = await db.history.get(path);
      if (cached) setText(cached.text);
      if (cached && listed && cached.sha === listed.sha) return;
      const file = await readTranscript(clientFromSettings(settings), path);
      if (!file) {
        if (!cached) setError('Die Datei gibt es im Vault nicht mehr.');
        return;
      }
      await db.files.put({ path, sha: file.sha, text: file.text });
      setText(file.text);
    } catch (e) {
      setError(toUserMessage(e, 'github'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, settings.githubToken, settings.vaultRepo, settings.vaultBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  let transcript: Transcript | null = null;
  let parseError = '';
  if (text !== null) {
    try {
      transcript = parseMarkdown(text);
    } catch (e) {
      parseError = `Datei hat nicht das erwartete Format: ${toUserMessage(e)}`;
    }
  }

  const fileName = path.slice(path.lastIndexOf('/') + 1);
  const copy = async () => {
    if (text === null) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const deleteAudio = async () => {
    if (job && confirm('Audio auf diesem Gerät löschen? Das Transkript im Vault bleibt.')) await db.audio.delete(job.id);
  };

  return (
    <div>
      <p>
        <a href={hrefFor.history}>← Verlauf</a>
      </p>
      {error && (
        <p className="error">
          {error} <button onClick={() => void load()}>Erneut versuchen</button>
        </p>
      )}
      {text === null && !error && <p>Lädt …</p>}

      {text !== null && (
        <div className="actions">
          <button onClick={() => downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), fileName)}>.md herunterladen</button>
          <button onClick={() => void copy()}>{copied ? 'Kopiert ✓' : 'In Zwischenablage kopieren'}</button>
          {audio && (
            <>
              <button onClick={() => downloadBlob(audio.blob, fileName.replace(/\.md$/, `.${audioExtension(audio.mimeType)}`))}>
                Audio herunterladen
              </button>
              <button onClick={() => void deleteAudio()}>Audio löschen</button>
            </>
          )}
        </div>
      )}

      {parseError && (
        <>
          <p className="error">{parseError}</p>
          <pre>{text}</pre>
        </>
      )}

      {transcript && (
        <article>
          <h1>{transcript.meta.title}</h1>
          <p>
            <small>
              {new Date(`${transcript.meta.date}T00:00`).toLocaleDateString('de-DE')} {transcript.meta.time} ·{' '}
              {transcript.meta.durationMin} min · {Object.values(transcript.meta.speakers).join(', ')}
            </small>
          </p>
          {transcript.segments.map((s, i) => (
            <p key={i} className="segment">
              <span className="ts">[{s.start}]</span> <strong>{transcript.meta.speakers[s.speaker] ?? s.speaker}:</strong> {s.text}
            </p>
          ))}
        </article>
      )}
    </div>
  );
}
