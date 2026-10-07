import { useState } from 'react';
import type { TranscriptRecord } from '../db/db';
import { db } from '../db/db';
import { toUserMessage } from '../lib/errors';
import { useSettings } from '../settings/settingsStore';
import { openInObsidian } from '../vault/obsidian';
import { Icon } from './Icon';

/** One tap: opens Obsidian, which writes the note into the shared vault. */
export function SaveToObsidianButton({ record, small = false }: { record: TranscriptRecord; small?: boolean }) {
  const settings = useSettings();
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    try {
      await openInObsidian(settings.sharedVault, record.path, record.markdown);
      await db.transcripts.update(record.id, { obsidianAt: Date.now() });
    } catch (e) {
      setError(toUserMessage(e));
    }
  };

  return (
    <>
      <button className={`btn-vault ${small ? 'btn-small' : 'btn-block'}`} onClick={() => void save()}>
        <Icon name="vault" size={small ? 18 : 22} />
        {record.obsidianAt ? 'Erneut in Obsidian speichern' : 'In Obsidian speichern'}
      </button>
      {error && <p className="error-text">{error}</p>}
    </>
  );
}
