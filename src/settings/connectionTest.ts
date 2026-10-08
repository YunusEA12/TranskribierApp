import { HttpError, toUserMessage } from '../lib/errors';
import { checkModel, createGeminiClient, listModels, NOT_FOR_AUDIO } from '../transcription/gemini';
import { clientFromSettings } from '../vault/vaultRepo';
import { REPO_RE, type Settings } from './settingsStore';

export interface CheckResult {
  label: string;
  ok: boolean;
  message: string;
  /** A one-tap fix the settings page can offer, e.g. a model id that exists. */
  fix?: { key: 'flashModel' | 'transcribeModel' | 'fallbackModel'; value: string };
}

export interface GeminiReport {
  checks: CheckResult[];
  models: string[]; // models the Gemini key can use, as suggestions for the settings
}

/** Best guess for a current general-purpose flash model among the ids a key can use. */
export function suggestFlashModel(models: string[], lite = false): string | undefined {
  const candidates = models.filter(
    (m) => /flash/.test(m) && lite === /lite/.test(m) && !NOT_FOR_AUDIO.test(m) && !/(live|audio|thinking|exp)/.test(m),
  );
  const stable = candidates.filter((m) => !/preview/.test(m));
  const pool = stable.length ? stable : candidates;
  return pool.sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1);
}

/** A second model for when the main one's free daily quota is used up: each model has its own quota. */
export function suggestFallbackModel(models: string[], main: string): string | undefined {
  const lite = suggestFlashModel(models, true);
  if (lite && lite !== main) return lite;
  const other = suggestFlashModel(models.filter((m) => m !== main));
  return other !== main ? other : undefined;
}

export async function testGemini(s: Settings): Promise<GeminiReport> {
  const checks: CheckResult[] = [];
  let models: string[] = [];
  if (!s.geminiKey.trim()) {
    checks.push({ label: 'Gemini-API-Key', ok: false, message: 'Bitte den Key einfügen.' });
    return { checks, models };
  }
  const ai = createGeminiClient(s.geminiKey);
  try {
    models = await listModels(ai);
  } catch (e) {
    checks.push({ label: 'Gemini-API-Key', ok: false, message: toUserMessage(e, 'gemini') });
    return { checks, models };
  }
  checks.push({ label: 'Gemini-API-Key', ok: true, message: 'Key ok.' });

  const configured: Array<{ key: 'flashModel' | 'transcribeModel' | 'fallbackModel'; id: string }> = [{ key: 'flashModel', id: s.flashModel.trim() }];
  if (s.engine === 'transcribe') configured.push({ key: 'transcribeModel', id: s.transcribeModel.trim() });
  if (s.fallbackModel.trim()) configured.push({ key: 'fallbackModel', id: s.fallbackModel.trim() });
  for (const { key, id } of configured) {
    if (key !== 'transcribeModel' && NOT_FOR_AUDIO.test(id)) {
      const suggestion = suggestFlashModel(models, key === 'fallbackModel');
      checks.push({
        label: `Modell ${id}`,
        ok: false,
        message: `kann keine Audiodateien verarbeiten.${suggestion ? ` Vorschlag: ${suggestion}.` : ''}`,
        fix: suggestion ? { key, value: suggestion } : undefined,
      });
      continue;
    }
    try {
      await checkModel(ai, id);
      checks.push({ label: `Modell ${id}`, ok: true, message: 'verfügbar.' });
    } catch (e) {
      const notFound = e instanceof HttpError && e.status === 404;
      const suggestion = key === 'transcribeModel' ? undefined : suggestFlashModel(models, key === 'fallbackModel');
      checks.push({
        label: `Modell ${id}`,
        ok: false,
        message: notFound ? `gibt es nicht (mehr).${suggestion ? ` Vorschlag: ${suggestion}.` : ''}` : toUserMessage(e, 'gemini'),
        fix: notFound && suggestion ? { key, value: suggestion } : undefined,
      });
    }
  }
  if (!s.fallbackModel.trim()) {
    const suggestion = suggestFallbackModel(models, s.flashModel.trim());
    if (suggestion) {
      checks.push({
        label: 'Ersatzmodell',
        ok: true,
        message: `noch keins eingetragen. Vorschlag: ${suggestion}. Es hat ein eigenes Tageslimit und springt ein, wenn das Hauptmodell aufgebraucht ist.`,
        fix: { key: 'fallbackModel', value: suggestion },
      });
    }
  }
  return { checks, models };
}

export async function testStorage(s: Settings): Promise<CheckResult> {
  if (!s.githubToken.trim() || !REPO_RE.test(s.vaultRepo.trim())) return { label: 'Speicher', ok: false, message: 'Noch nicht verbunden.' };
  try {
    const { canPush } = await clientFromSettings(s).checkAccess();
    return canPush
      ? { label: 'Speicher', ok: true, message: 'Verbunden.' }
      : { label: 'Speicher', ok: false, message: 'Der Schlüssel darf nicht schreiben. Beim Token „Contents: Read and write“ wählen.' };
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) {
      return { label: 'Speicher', ok: false, message: `Das Repo „${s.vaultRepo.trim()}“ gibt es nicht, oder der Schlüssel hat keinen Zugriff darauf.` };
    }
    return { label: 'Speicher', ok: false, message: toUserMessage(e, 'github') };
  }
}
