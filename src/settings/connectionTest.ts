import { HttpError, toUserMessage } from '../lib/errors';
import { checkModel, createGeminiClient, listModels } from '../transcription/gemini';
import { clientFromSettings } from '../vault/vaultRepo';
import { missingSettings, type Settings } from './settingsStore';

export interface CheckResult {
  label: string;
  ok: boolean;
  message: string;
  /** A one-tap fix the settings page can offer, e.g. a model id that exists. */
  fix?: { key: 'flashModel' | 'transcribeModel' | 'fallbackModel'; value: string };
}

export interface ConnectionReport {
  checks: CheckResult[];
  models: string[]; // models the Gemini key can use, as suggestions for the settings
}

const VAULT_REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/** Best guess for a current general-purpose flash model among the ids a key can use. */
export function suggestFlashModel(models: string[], lite = false): string | undefined {
  const candidates = models.filter(
    (m) => /flash/.test(m) && lite === /lite/.test(m) && !/(image|tts|live|audio|embedding|thinking|exp)/.test(m),
  );
  const stable = candidates.filter((m) => !/preview/.test(m));
  const pool = stable.length ? stable : candidates;
  return pool.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
}

export async function testConnections(s: Settings): Promise<ConnectionReport> {
  const results: CheckResult[] = [];
  const missing = missingSettings(s);
  if (missing.includes('Name')) results.push({ label: 'Name', ok: false, message: 'Bitte Feld 1 ausfüllen.' });

  // GitHub
  const repoOk = VAULT_REPO_RE.test(s.vaultRepo.trim());
  if (!repoOk) results.push({ label: 'Vault-Repo', ok: false, message: 'Feld 3 fehlt oder hat nicht die Form „github-name/repo-name“.' });
  if (!s.githubToken.trim()) results.push({ label: 'GitHub-Token', ok: false, message: 'Feld 4 ist leer.' });
  if (repoOk && s.githubToken.trim()) {
    try {
      const { canPush } = await clientFromSettings(s).checkAccess();
      results.push(
        canPush
          ? { label: 'GitHub', ok: true, message: `Zugriff auf ${s.vaultRepo.trim()} ok.` }
          : { label: 'GitHub', ok: false, message: 'Repo gefunden, aber der Token darf nicht schreiben (Contents: „Read and write“ fehlt).' },
      );
    } catch (e) {
      results.push({
        label: 'GitHub',
        ok: false,
        message:
          e instanceof HttpError && e.status === 404
            ? `Repo „${s.vaultRepo.trim()}“ nicht gefunden. Gibt es das Repo schon, und hat der Token Zugriff darauf (Only select repositories → ${s.vaultRepo.split('/')[1]})?`
            : toUserMessage(e, 'github'),
      });
    }
  }

  // Gemini
  let models: string[] = [];
  if (!s.geminiKey.trim()) {
    results.push({ label: 'Gemini-API-Key', ok: false, message: 'Feld 2 ist leer.' });
    return { checks: results, models };
  }
  const ai = createGeminiClient(s.geminiKey);
  try {
    models = await listModels(ai);
  } catch (e) {
    results.push({ label: 'Gemini-API-Key', ok: false, message: toUserMessage(e, 'gemini') });
    return { checks: results, models };
  }
  results.push({ label: 'Gemini-API-Key', ok: true, message: 'Key ok.' });

  const configured: Array<{ key: 'flashModel' | 'transcribeModel' | 'fallbackModel'; id: string }> = [{ key: 'flashModel', id: s.flashModel.trim() }];
  if (s.engine === 'transcribe') configured.push({ key: 'transcribeModel', id: s.transcribeModel.trim() });
  if (s.fallbackModel.trim()) configured.push({ key: 'fallbackModel', id: s.fallbackModel.trim() });
  for (const { key, id } of configured) {
    try {
      await checkModel(ai, id);
      results.push({ label: `Modell ${id}`, ok: true, message: 'verfügbar.' });
    } catch (e) {
      const notFound = e instanceof HttpError && e.status === 404;
      const suggestion = key === 'transcribeModel' ? undefined : suggestFlashModel(models, key === 'fallbackModel');
      results.push({
        label: `Modell ${id}`,
        ok: false,
        message: notFound ? `gibt es nicht (mehr).${suggestion ? ` Vorschlag: ${suggestion}.` : ''}` : toUserMessage(e, 'gemini'),
        fix: notFound && suggestion ? { key, value: suggestion } : undefined,
      });
    }
  }
  return { checks: results, models };
}
