import { useState } from 'react';
import { kickRunner } from '../jobs/runner';
import { testConnections, type CheckResult } from '../settings/connectionTest';
import { DEFAULT_SETTINGS, saveSettings, useSettings, type Settings } from '../settings/settingsStore';

export function SettingsPage() {
  const stored = useSettings();
  const [draft, setDraft] = useState<Settings>(stored);
  const [saved, setSaved] = useState(false);
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const [testing, setTesting] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };
  const text = (key: keyof Settings, label: string, opts: { secret?: boolean; placeholder?: string; hint?: string } = {}) => (
    <label>
      {label}
      <input
        type={opts.secret ? 'password' : 'text'}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={draft[key] as string}
        placeholder={opts.placeholder}
        onChange={(e) => set(key, e.target.value as never)}
      />
      {opts.hint && <small>{opts.hint}</small>}
    </label>
  );

  const save = () => {
    saveSettings(draft);
    setSaved(true);
    kickRunner();
  };

  const test = async () => {
    save();
    setTesting(true);
    setChecks(null);
    try {
      setChecks(await testConnections(draft));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <h1>Einstellungen</h1>
      <p>
        <small>
          Alles wird nur in diesem Browser gespeichert. Auf dem iPhone haben die installierte App und der Browser-Tab
          getrennten Speicher: hier in der installierten App eintragen.
        </small>
      </p>

      <fieldset>
        <legend>Profil</legend>
        {text('userName', 'Name', { placeholder: 'Yunus' })}
      </fieldset>

      <fieldset>
        <legend>Gemini</legend>
        {text('geminiKey', 'API-Key', { secret: true, hint: 'Google AI Studio → Get API key' })}
        <label>
          Engine
          <select value={draft.engine} onChange={(e) => set('engine', e.target.value as Settings['engine'])}>
            <option value="flash">A: Flash-Modell (Sprecher, Titel in einem Schritt)</option>
            <option value="transcribe">B: Transcribe-Modell (max. 30 min mit Sprechern)</option>
          </select>
        </label>
        {text('flashModel', 'Modell-ID Flash', { placeholder: DEFAULT_SETTINGS.flashModel })}
        {text('transcribeModel', 'Modell-ID Transcribe', { placeholder: DEFAULT_SETTINGS.transcribeModel })}
        <label className="check">
          <input type="checkbox" checked={draft.removeFillers} onChange={(e) => set('removeFillers', e.target.checked)} />
          Füllwörter („äh“, „ähm“) entfernen
        </label>
      </fieldset>

      <fieldset>
        <legend>Vault (GitHub)</legend>
        {text('githubToken', 'Token', { secret: true, hint: 'Fine-grained Token, nur für das Vault-Repo, Contents: Read and write' })}
        {text('vaultRepo', 'Repo (owner/repo)', { placeholder: 'yunusea12/mitschrift-vault' })}
        {text('vaultBranch', 'Branch', { placeholder: 'main' })}
        {text('vaultBaseDir', 'Unterordner (optional)', { hint: 'Nur bei einem gemeinsamen Vault, z. B. „calvin“' })}
      </fieldset>

      <div className="actions">
        <button onClick={save}>Speichern</button>
        <button onClick={() => void test()} disabled={testing}>
          {testing ? 'Teste …' : 'Verbindung testen'}
        </button>
      </div>
      {saved && !checks && !testing && <p className="ok">Gespeichert.</p>}
      {checks && (
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.label} className={c.ok ? 'ok' : 'error'}>
              {c.ok ? '✓' : '✗'} {c.label}: {c.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
