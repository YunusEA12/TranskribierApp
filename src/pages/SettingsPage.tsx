import { useState, type ReactNode } from 'react';
import { kickRunner } from '../jobs/runner';
import { testConnections, type CheckResult } from '../settings/connectionTest';
import { DEFAULT_SETTINGS, saveSettings, useSettings, type Settings } from '../settings/settingsStore';

const ext = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {text}
  </a>
);

export function SettingsPage() {
  const stored = useSettings();
  const [draft, setDraft] = useState<Settings>(stored);
  const [saved, setSaved] = useState(false);
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };
  const text = (
    key: keyof Settings,
    label: ReactNode,
    opts: { secret?: boolean; placeholder?: string; hint?: ReactNode; models?: boolean } = {},
  ) => (
    <label>
      {label}
      <input
        id={`setting-${key}`}
        type={opts.secret ? 'password' : 'text'}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={draft[key] as string}
        placeholder={opts.placeholder}
        list={opts.models ? 'gemini-models' : undefined}
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
      const report = await testConnections(draft);
      setChecks(report.checks);
      setModels(report.models);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <h1>Einstellungen</h1>
      <p className="notice">
        Du musst nur die <b>4 Felder</b> unten ausfüllen und auf <b>Speichern und testen</b> tippen. „Weitere Einstellungen“
        kannst du so lassen.
      </p>

      <fieldset>
        <legend>Ausfüllen</legend>
        {text('userName', <b>1. Dein Name</b>, { placeholder: 'z. B. Yunus' })}
        {text('geminiKey', <b>2. Gemini-API-Key</b>, {
          secret: true,
          hint: (
            <>
              Key holen: {ext('https://aistudio.google.com/apikey', 'aistudio.google.com/apikey')} → „Create API key“ →
              kopieren und hier einfügen.
            </>
          ),
        })}
        {text('vaultRepo', <b>3. Vault-Repo</b>, {
          placeholder: 'z. B. yunusea12/mitschrift-vault',
          hint: (
            <>
              Dein GitHub-Name, Schrägstrich, Name des Repos. Noch kein Repo? {ext('https://github.com/new', 'Hier anlegen')}: Name
              „mitschrift-vault“, <b>Private</b>, „Add a README file“ anhaken.
            </>
          ),
        })}
        {text('githubToken', <b>4. GitHub-Token</b>, {
          secret: true,
          hint: (
            <>
              {ext('https://github.com/settings/personal-access-tokens/new', 'Token erstellen')}: Repository access → „Only select
              repositories“ → mitschrift-vault. Permissions → „Contents“ → „Read and write“. Dann „Generate token“, kopieren und
              hier einfügen.
            </>
          ),
        })}
      </fieldset>

      <div className="actions">
        <button className="primary" onClick={() => void test()} disabled={testing}>
          {testing ? 'Teste …' : 'Speichern und testen'}
        </button>
      </div>
      {saved && !checks && !testing && <p className="ok">Gespeichert.</p>}
      {checks && (
        <ul className="checks">
          {checks.map((c) => (
            <li key={c.label} className={c.ok ? 'ok' : 'error'}>
              {c.ok ? '✓' : '✗'} {c.label}: {c.message}
              {c.fix && (
                <button className="inline" onClick={() => set(c.fix!.key, c.fix!.value)}>
                  Übernehmen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {checks?.every((c) => c.ok) && <p className="ok">Alles bereit. Du kannst unter „Aufnahme“ loslegen.</p>}

      <details>
        <summary>Weitere Einstellungen (kannst du so lassen)</summary>
        <fieldset>
          <legend>Transkription</legend>
          <label>
            Engine
            <select id="setting-engine" value={draft.engine} onChange={(e) => set('engine', e.target.value as Settings['engine'])}>
              <option value="flash">A: Flash-Modell (Sprecher, Titel in einem Schritt)</option>
              <option value="transcribe">B: Transcribe-Modell (max. 30 min mit Sprechern)</option>
            </select>
          </label>
          {text('flashModel', 'Modell-ID Flash', { placeholder: DEFAULT_SETTINGS.flashModel, models: true })}
          {text('transcribeModel', 'Modell-ID Transcribe', { placeholder: DEFAULT_SETTINGS.transcribeModel, models: true })}
          {text('fallbackModel', 'Ersatzmodell (optional)', {
            models: true,
            hint: 'Springt ein, wenn das Tageslimit des Hauptmodells erreicht ist, z. B. ein „flash-lite“-Modell. Leer = kein Ersatz.',
          })}
          <datalist id="gemini-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {models.length === 0 && <small>Nach „Speichern und testen“ werden die verfügbaren Modelle beim Tippen vorgeschlagen.</small>}
          <label className="check">
            <input
              id="setting-removeFillers"
              type="checkbox"
              checked={draft.removeFillers}
              onChange={(e) => set('removeFillers', e.target.checked)}
            />
            Füllwörter („äh“, „ähm“) entfernen
          </label>
        </fieldset>
        <fieldset>
          <legend>Vault</legend>
          {text('vaultBranch', 'Branch', { placeholder: 'main' })}
          {text('vaultBaseDir', 'Unterordner (optional)', { hint: 'Nur bei einem gemeinsamen Vault, z. B. „calvin“' })}
        </fieldset>
        <div className="actions">
          <button onClick={save}>Speichern</button>
        </div>
      </details>

      <p>
        <small>
          Alles wird nur auf diesem Gerät gespeichert. Auf dem iPhone haben die App vom Home-Bildschirm und der Safari-Tab
          getrennten Speicher: hier in der App vom Home-Bildschirm eintragen.
        </small>
      </p>
    </div>
  );
}
