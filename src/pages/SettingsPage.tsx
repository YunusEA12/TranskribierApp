import { useCallback, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { InviteQr } from '../components/InviteQr';
import { QrScanner } from '../components/QrScanner';
import { kickRunner } from '../jobs/runner';
import { APP_VERSION, BUILD_TIME, checkForUpdate, installUpdate, useUpdateReady } from '../pwa/update';
import { testGemini, testStorage, type CheckResult } from '../settings/connectionTest';
import { decodeInvite, encodeInvite } from '../settings/invite';
import { DEFAULT_SETTINGS, getSettings, saveSettings, storageConnected, useSettings, allGeminiKeys, type Settings } from '../settings/settingsStore';
import { diagnoseTranscription, type DiagnosisLine } from '../transcription/diagnose';
import { userFolder } from '../vault/paths';

const PEOPLE = ['Yunus', 'Calvin'];
const CHECKED_KEYS = new Set<keyof Settings>(['geminiKey', 'geminiFallbackKeys', 'engine', 'flashModel', 'transcribeModel', 'fallbackModel']);

const REPO_NAME = DEFAULT_SETTINGS.vaultRepo.split('/')[1]!;
const NEW_REPO_URL = `https://github.com/new?name=${REPO_NAME}&visibility=private&description=${encodeURIComponent('Gemeinsamer Speicher der Mitschrift-App')}`;
const NEW_TOKEN_URL = `https://github.com/settings/personal-access-tokens/new?name=Mitschrift&description=${encodeURIComponent('Mitschrift-App')}&expires_in=366&contents=write`;

function Checks({ checks, onFix }: { checks: CheckResult[]; onFix?: (c: CheckResult) => void }) {
  return (
    <ul className="checks">
      {checks.map((c) => (
        <li key={c.label} className={c.ok ? 'ok' : 'bad'}>
          <span className="mark">
            <Icon name={c.ok ? 'check' : 'alert'} size={14} />
          </span>
          <span>
            <b>{c.label}:</b> {c.message}{' '}
            {c.fix && onFix && (
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

const ext = (href: string, children: ReactNode) => (
  <a href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

function DiagnosisCard() {
  const settings = useSettings();
  const [lines, setLines] = useState<DiagnosisLine[]>([]);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setLines([]);
    setRunning(true);
    try {
      await diagnoseTranscription(settings, (line) => setLines((l) => [...l, line]));
    } finally {
      setRunning(false);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(lines.map((l) => `${l.ok === null ? '·' : l.ok ? '✓' : '✗'} ${l.text}`).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="card stack" aria-labelledby="diag-title">
      <div className="row">
        <Icon name="alert" />
        <h2 id="diag-title">Fehlersuche</h2>
      </div>
      <small>
        Schickt einen 2-Sekunden-Testton an Gemini und prüft jeden Schritt einzeln. Dauert meist unter einer Minute; die App dabei geöffnet
        lassen. Das Ergebnis enthält keinen Key.
      </small>
      <button className="btn-ghost" disabled={running || !allGeminiKeys(settings).length} onClick={() => void run()}>
        {running ? 'Test läuft …' : 'Transkription testen'}
      </button>

      {lines.length > 0 && (
        <ul className="checks">
          {lines.map((l, i) => (
            <li key={i} className={l.ok === null ? '' : l.ok ? 'ok' : 'bad'}>
              <span className="mark">{l.ok === null ? '·' : <Icon name={l.ok ? 'check' : 'alert'} size={14} />}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 && !running && (
        <button className="btn-small btn-ghost" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} size={18} />
          {copied ? 'Kopiert' : 'Ergebnis kopieren'}
        </button>
      )}
    </section>
  );
}

function StorageCard() {
  const settings = useSettings();
  const connected = storageConnected(settings);
  const [mode, setMode] = useState<'idle' | 'setup' | 'scan' | 'invite'>('idle');
  const [token, setToken] = useState('');
  const [pasted, setPasted] = useState('');
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);

  const [copyInvite, setCopyInvite] = useState(false);

  const connect = useCallback(async (patch: Partial<Settings>) => {
    setBusy(true);
    setCheck(null);
    const candidate = { ...getSettings(), ...patch };
    const result = await testStorage(candidate);
    if (result.ok) saveSettings({ ...patch, storageVerified: true });
    else if (!Object.keys(patch).length) saveSettings({ storageVerified: false });
    setCheck(result);
    setBusy(false);
    if (result.ok) {
      setMode('idle');
      kickRunner();
    }
  }, []);

  const onScan = useCallback(
    (text: string) => {
      const invite = decodeInvite(text);
      setMode('idle');
      if (!invite) {
        setCheck({ label: 'Einladung', ok: false, message: 'Das ist kein Einladungs-Code der Mitschrift-App.' });
        return;
      }
      const patch: Partial<Settings> = {
        githubToken: invite.token,
        vaultRepo: invite.repo,
        vaultBranch: invite.branch,
      };
      if (invite.geminiKey) patch.geminiKey = invite.geminiKey;
      if (invite.geminiFallbackKeys) patch.geminiFallbackKeys = invite.geminiFallbackKeys;
      void connect(patch);
    },
    [connect],
  );

  const isCalvin = settings.userName === 'Calvin';
  const otherPerson = settings.userName === 'Calvin' ? 'Yunus' : 'Calvin';

  return (
    <section className="card stack" aria-labelledby="storage-title">
      <div className="title-row row">
        <Icon name="vault" />
        <h2 id="storage-title">Gemeinsamer Speicher</h2>
        {connected ? <span className="pill ok">verbunden</span> : <span className="pill warn">nicht verbunden</span>}
      </div>
      <small>
        Hier landen die Transkripte von euch beiden, jeder in seinem Ordner. In der App seht ihr beide alles. Einmal einrichten, danach
        nie wieder.
      </small>

      {connected && mode !== 'invite' && (
        <>
          <p>
            Verbunden mit <b>{settings.vaultRepo.split('/')[1]}</b>.
          </p>
          <div className="actions">
            <button className="btn-vault" onClick={() => setMode('invite')}>
              {otherPerson} einladen (QR-Code)
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => void connect({})}>
              Verbindung prüfen
            </button>
          </div>
        </>
      )}

      {connected && mode === 'invite' && (
        <div className="stack invite">
          <InviteQr
            text={encodeInvite({
              repo: settings.vaultRepo,
              branch: settings.vaultBranch,
              token: settings.githubToken,
              geminiKey: settings.geminiKey,
              geminiFallbackKeys: settings.geminiFallbackKeys,
            })}
          />
          <small>
            {otherPerson} öffnet in seiner Mitschrift-App <b>Einstellungen → Gemeinsamer Speicher → Einladung scannen</b> und hält die Kamera
            auf diesen Code. Speicher und API-Keys werden direkt übertragen!
          </small>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button
              className="btn-small btn-ghost"
              onClick={() => {
                const code = encodeInvite({
                  repo: settings.vaultRepo,
                  branch: settings.vaultBranch,
                  token: settings.githubToken,
                  geminiKey: settings.geminiKey,
                  geminiFallbackKeys: settings.geminiFallbackKeys,
                });
                void navigator.clipboard.writeText(code);
                setCopyInvite(true);
                setTimeout(() => setCopyInvite(false), 2000);
              }}
            >
              <Icon name={copyInvite ? 'check' : 'copy'} size={16} />
              {copyInvite ? 'Code kopiert!' : 'Code für Chat kopieren'}
            </button>
          </div>
          <button className="btn-ghost" onClick={() => setMode('idle')}>
            Fertig
          </button>
        </div>
      )}


      {!connected && mode === 'idle' && (
        <div className="actions">
          <button className={isCalvin ? 'btn-ghost' : 'btn-vault'} onClick={() => setMode('setup')}>
            Ich richte ihn ein (Yunus)
          </button>
          <button className={isCalvin ? 'btn-vault' : 'btn-ghost'} onClick={() => setMode('scan')}>
            Einladung scannen (Calvin)
          </button>
        </div>
      )}

      {!connected && mode === 'setup' && (
        <div className="stack">
          <ol className="step-list setup-steps">
            <li>
              {ext(NEW_REPO_URL, <b>Speicher bei GitHub anlegen</b>)}: Der Name „{REPO_NAME}“ und „Private“ sind schon ausgefüllt. Nur unten auf
              „Create repository“ tippen.
            </li>
            <li>
              {ext(NEW_TOKEN_URL, <b>Schlüssel erstellen</b>)}: Bei „Repository access“ <b>Only select repositories</b> → „{REPO_NAME}“
              wählen. Bei „Permissions“ → <b>Contents</b> → <b>Read and write</b>. Dann „Generate token“ und den Schlüssel kopieren.
            </li>
            <li>Schlüssel hier einfügen:</li>
          </ol>
          <input
            id="storage-token"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="github_pat_…"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
          />
          <div className="actions">
            <button className="btn-vault" disabled={!token || busy} onClick={() => void connect({ githubToken: token })}>
              {busy ? 'Verbinde …' : 'Verbinden'}
            </button>
            <button className="btn-ghost" onClick={() => setMode('idle')}>
              Zurück
            </button>
          </div>
        </div>
      )}

      {!connected && mode === 'scan' && (
        <>
          <QrScanner onResult={onScan} onCancel={() => setMode('idle')} />
          <details>
            <summary>Kamera geht nicht? Code einfügen</summary>
            <div className="stack">
              <input
                id="invite-code"
                type="text"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="MITSCHRIFT1:…"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <button className="btn-vault" disabled={!pasted.trim()} onClick={() => onScan(pasted)}>
                Übernehmen
              </button>
            </div>
          </details>
        </>
      )}

      {check && <Checks checks={[check]} />}
      {connected && (
        <button
          className="btn-small btn-danger"
          onClick={() => {
            if (confirm('Verbindung zum gemeinsamen Speicher auf diesem Handy trennen? Die Transkripte im Speicher bleiben erhalten.')) {
              saveSettings({ githubToken: '' });
              setCheck(null);
            }
          }}
        >
          Verbindung trennen
        </button>
      )}
    </section>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const [checks, setChecks] = useState<CheckResult[] | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const updateReady = useUpdateReady();
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'current' | 'unsupported'>('idle');

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
      const report = await testGemini(settings);
      setChecks(report.checks);
      setModels(report.models);
      if (report.checks.every((c) => c.ok)) kickRunner();
    } finally {
      setTesting(false);
    }
  };

  const keys = allGeminiKeys(settings);
  const hasKey = keys.length > 0;
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
        <p className="muted">Jeder nutzt seinen eigenen Key. Er bleibt auf diesem Gerät.</p>
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
        <label className="field">
          <span>Haupt-Key</span>
          <input
            id="setting-geminiKey"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Haupt-Key hier einfügen"
            value={settings.geminiKey}
            onChange={(e) => set('geminiKey', e.target.value.trim())}
            onBlur={kickRunner}
          />
        </label>
        <label className="field" style={{ marginTop: '0.5rem' }}>
          <span>Ersatz-Keys / Fallback-Keys (optional)</span>
          <textarea
            id="setting-geminiFallbackKeys"
            rows={2}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Weitere Gemini-Keys (durch Komma oder Zeilenumbruch getrennt)"
            value={settings.geminiFallbackKeys}
            onChange={(e) => set('geminiFallbackKeys', e.target.value)}
            onBlur={kickRunner}
          />
          <small>
            Springen automatisch ein, wenn das Kontingent des Haupt-Keys aufgebraucht ist.
          </small>
        </label>
        <button className="btn-vault btn-block" onClick={() => void test()} disabled={testing || !hasKey}>
          {testing ? 'Prüfe …' : keys.length > 1 ? 'Alle Keys prüfen' : 'Key prüfen'}
        </button>
        {checks && <Checks checks={checks} onFix={(c) => c.fix && set(c.fix.key, c.fix.value)} />}
      </section>


      <section className="card stack" aria-labelledby="who-title">
        <div className="row">
          <Icon name="person" />
          <h2 id="who-title">Wer bist du?</h2>
        </div>
        <div className="chips" role="group" aria-label="Name">
          {PEOPLE.map((p) => (
            <button
              key={p}
              className="chip"
              aria-pressed={settings.userName === p}
              onClick={() => {
                set('userName', p);
                kickRunner();
              }}
            >
              {p}
            </button>
          ))}
        </div>
        <small>
          {userFolder(settings.userName)
            ? `Deine Transkripte landen im Ordner „${userFolder(settings.userName)}“.`
            : 'Einmal antippen. Davon hängt ab, in welchem Ordner deine Transkripte landen.'}
        </small>
      </section>

      <StorageCard />

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

          <span className="eyebrow sub-head">Speicher</span>
          {text('vaultRepo', 'Repo', { placeholder: DEFAULT_SETTINGS.vaultRepo, hint: 'Normalerweise nicht ändern.' })}
          {text('vaultBranch', 'Branch', { placeholder: 'main' })}
        </div>
      </details>

      <DiagnosisCard />

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
        Key und Schlüssel werden nur auf diesem Gerät gespeichert. Auf dem iPhone haben die App vom Home-Bildschirm und Safari getrennten
        Speicher: hier in der App vom Home-Bildschirm eintragen.
      </p>
    </div>
  );
}
