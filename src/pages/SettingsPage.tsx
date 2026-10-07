import { useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { kickRunner } from '../jobs/runner';
import { testConnections, type CheckResult } from '../settings/connectionTest';
import { APP_VERSION, BUILD_TIME, checkForUpdate, installUpdate, useUpdateReady } from '../pwa/update';
import { DEFAULT_SETTINGS, saveSettings, useSettings, type Settings } from '../settings/settingsStore';
import { userFolder } from '../vault/paths';

const PEOPLE = ['Yunus', 'Calvin'];
const CHECKED_KEYS = new Set<keyof Settings>(['geminiKey', 'engine', 'flashModel', 'transcribeModel', 'fallbackModel', 'githubToken', 'vaultRepo', 'vaultBranch']);

function Checks({ checks, onFix }: { checks: CheckResult[]; onFix: (c: CheckResult) => void }) {
  return (
    <ul className="checks">
      {checks.map((c) => (
        <li key={c.label} className={c.ok ? 'ok' : 'bad'}>
          <span className="mark">
            <Icon name={c.ok ? 'check' : 'alert'} size={14} />
          </span>
          <span>
            <b>{c.label}:</b> {c.message}{' '}
            {c.fix && (
              <button className="btn-small btn-ghost" onClick={() => onFix(c)}>
                Übernehmen
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const updateReady = useUpdateReady();
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'current' | 'unsupported'>('idle');
  const [otherName, setOtherName] = useState(!PEOPLE.includes(settings.userName) && settings.userName !== '');

  // Every change is saved right away; nothing to forget. Only changes the check covers invalidate its result.
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    saveSettings({ [key]: value } as Partial<Settings>);
    if (CHECKED_KEYS.has(key)) setChecks(null);
  };

  const text = (key: keyof Settings, label: ReactNode, opts: { secret?: boolean; placeholder?: string; hint?: ReactNode; models?: boolean } = {}) => (
    <label className="field">
      {label}
      <input
        id={`setting-${key}`}
        type={opts.secret ? 'password' : 'text'}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={settings[key] as string}
        placeholder={opts.placeholder}
        list={opts.models ? 'gemini-models' : undefined}
        onChange={(e) => set(key, e.target.value as never)}
      />
      {opts.hint && <small>{opts.hint}</small>}
    </label>
  );

  const test = async () => {
    setTesting(true);
    setChecks(null);
    try {
      const report = await testConnections(settings);
      setChecks(report.checks);
      setModels(report.models);
      if (report.checks.every((c) => c.ok)) kickRunner();
    } finally {
      setTesting(false);
    }
  };

  const hasKey = settings.geminiKey.trim() !== '';
  const allOk = checks?.every((c) => c.ok);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Einstellungen</h1>
      </div>

      <section className="card key-card" aria-labelledby="key-title">
        <div className="title-row">
          <Icon name="key" />
          <h2 id="key-title">Gemini-API-Key</h2>
          {allOk ? <span className="pill ok">geprüft</span> : hasKey ? <span className="pill">eingetragen</span> : <span className="pill warn">fehlt</span>}
        </div>
        <p className="muted">Das ist das Einzige, was die App braucht. Der Key bleibt auf diesem Gerät.</p>
        <ol className="step-list">
          <li>
            Key bei Google holen:{' '}
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
              aistudio.google.com/apikey
            </a>
          </li>
          <li>„Create API key“ antippen und den Key kopieren</li>
          <li>Hier einfügen und prüfen</li>
        </ol>
        <input
          id="setting-geminiKey"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Key hier einfügen"
          value={settings.geminiKey}
          onChange={(e) => set('geminiKey', e.target.value.trim())}
          onBlur={kickRunner}
        />
        <button className="btn-vault btn-block" onClick={() => void test()} disabled={testing || !hasKey}>
          {testing ? 'Prüfe …' : 'Key prüfen'}
        </button>
        {checks && <Checks checks={checks} onFix={(c) => c.fix && set(c.fix.key, c.fix.value)} />}
        {allOk && <p className="ok-text">Alles bereit. Unter „Aufnahme“ kannst du loslegen.</p>}
      </section>

      <section className="card stack" aria-labelledby="who-title">
        <div className="row">
          <Icon name="person" />
          <h2 id="who-title">Wer nimmt auf?</h2>
        </div>
        <div className="chips" role="group" aria-label="Name">
          {PEOPLE.map((p) => (
            <button
              key={p}
              className="chip"
              aria-pressed={!otherName && settings.userName === p}
              onClick={() => {
                setOtherName(false);
                set('userName', p);
              }}
            >
              {p}
            </button>
          ))}
          <button className="chip" aria-pressed={otherName} onClick={() => setOtherName(true)}>
            Andere
          </button>
        </div>
        {otherName && text('userName', 'Name', { placeholder: 'Dein Name' })}
        <small>
          {userFolder(settings.userName)
            ? `Deine Notizen landen in Obsidian im eigenen Ordner „Transkripte/${userFolder(settings.userName)}“.`
            : 'Wähle deinen Namen, dann bekommst du in Obsidian einen eigenen Ordner. Ohne Namen landet alles in „Transkripte“.'}
        </small>
      </section>

      <section className="card stack" aria-labelledby="vault-title">
        <div className="row">
          <Icon name="vault" />
          <h2 id="vault-title">Obsidian</h2>
        </div>
        {text('obsidianVault', 'Name des Vaults', {
          placeholder: 'z. B. Notizen',
          hint: 'Genau so, wie der Vault in Obsidian heißt. Kannst du auch beim ersten Speichern eintragen.',
        })}
        <small>
          Notizen landen im Ordner „Transkripte/{userFolder(settings.userName) || 'Name'}/Jahr“. Obsidian muss auf diesem Gerät installiert
          sein.
        </small>
      </section>

      <details className="card">
        <summary>Weitere Einstellungen</summary>
        <div className="stack">
          <span className="eyebrow">Transkription</span>
          <label className="field">
            Engine
            <select id="setting-engine" value={settings.engine} onChange={(e) => set('engine', e.target.value as Settings['engine'])}>
              <option value="flash">A: Flash-Modell (Sprecher und Titel in einem Schritt)</option>
              <option value="transcribe">B: Transcribe-Modell (max. 30 min mit Sprechern)</option>
            </select>
          </label>
          {text('flashModel', 'Modell-ID Flash', { placeholder: DEFAULT_SETTINGS.flashModel, models: true })}
          {text('transcribeModel', 'Modell-ID Transcribe', { placeholder: DEFAULT_SETTINGS.transcribeModel, models: true })}
          {text('fallbackModel', 'Ersatzmodell (optional)', {
            models: true,
            hint: 'Springt ein, wenn das Tageslimit des Hauptmodells erreicht ist, z. B. ein „flash-lite“-Modell. Nach „Key prüfen“ werden passende Modelle vorgeschlagen.',
          })}
          <datalist id="gemini-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <label className="toggle">
            <input id="setting-removeFillers" type="checkbox" checked={settings.removeFillers} onChange={(e) => set('removeFillers', e.target.checked)} />
            Füllwörter („äh“, „ähm“) entfernen
          </label>

          <span className="eyebrow sub-head">Sicherung auf GitHub (optional)</span>
          <small>Nur nötig, wenn Transkripte zusätzlich in einem GitHub-Repo landen sollen. Sonst leer lassen.</small>
          {text('vaultRepo', 'Repo', { placeholder: 'github-name/repo-name' })}
          {text('githubToken', 'Token', { secret: true, hint: 'Fine-grained Token nur für dieses Repo, Contents: Read and write' })}
          {text('vaultBranch', 'Branch', { placeholder: 'main' })}
          {text('vaultBaseDir', 'Unterordner im Repo', { placeholder: 'leer = oberste Ebene' })}
        </div>
      </details>

      <section className="card stack" aria-labelledby="version-title">
        <div className="row">
          <Icon name="retry" />
          <h2 id="version-title">App-Version</h2>
          {updateReady && <span className="pill vault">Update bereit</span>}
        </div>
        <small>
          Version {APP_VERSION} vom {new Date(BUILD_TIME).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}. Updates
          kommen von selbst; die App muss dafür nicht neu installiert werden.
        </small>
        {updateReady ? (
          <button className="btn-vault" onClick={installUpdate}>
            Jetzt aktualisieren
          </button>
        ) : (
          <button
            className="btn-ghost"
            disabled={updateState === 'checking'}
            onClick={() => {
              setUpdateState('checking');
              void checkForUpdate().then((r) => setUpdateState(r === 'available' ? 'idle' : r));
            }}
          >
            {updateState === 'checking' ? 'Suche …' : 'Nach Update suchen'}
          </button>
        )}
        {updateState === 'current' && !updateReady && <small className="ok-text">Du hast die neueste Version.</small>}
        {updateState === 'unsupported' && <small>Updates werden geprüft, sobald die App vom Home-Bildschirm aus geöffnet ist.</small>}
      </section>

      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Alles wird nur auf diesem Gerät gespeichert. Auf dem iPhone haben die App vom Home-Bildschirm und Safari getrennten Speicher: hier in
        der App vom Home-Bildschirm eintragen.
      </p>
    </div>
  );
}
