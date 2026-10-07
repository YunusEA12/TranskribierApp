import { toUserMessage } from '../lib/errors';
import { checkModel, createGeminiClient, listModels } from '../transcription/gemini';
import { clientFromSettings } from '../vault/vaultRepo';
import type { Settings } from './settingsStore';

export interface CheckResult {
  label: string;
  ok: boolean;
  message: string;
}

export interface ConnectionReport {
  checks: CheckResult[];
  models: string[]; // models the Gemini key can use, as suggestions for the settings
}

export async function testConnections(s: Settings): Promise<ConnectionReport> {
  const results: CheckResult[] = [];

  try {
    const { canPush } = await clientFromSettings(s).checkAccess();
    results.push(
      canPush
        ? { label: 'GitHub', ok: true, message: `Zugriff auf ${s.vaultRepo} (${s.vaultBranch}) ok.` }
        : { label: 'GitHub', ok: false, message: 'Repo lesbar, aber der Token darf nicht schreiben (Contents: Read and write).' },
    );
  } catch (e) {
    results.push({ label: 'GitHub', ok: false, message: toUserMessage(e, 'github') });
  }

  const ai = createGeminiClient(s.geminiKey);
  const configured = s.engine === 'transcribe' ? [s.transcribeModel, s.flashModel] : [s.flashModel];
  if (s.fallbackModel.trim()) configured.push(s.fallbackModel);
  for (const model of configured) {
    try {
      await checkModel(ai, model.trim());
      results.push({ label: `Gemini (${model.trim()})`, ok: true, message: 'Key und Modell ok.' });
    } catch (e) {
      results.push({ label: `Gemini (${model.trim()})`, ok: false, message: toUserMessage(e, 'gemini') });
    }
  }
  let models: string[] = [];
  try {
    models = await listModels(ai);
  } catch {
    // The per-model checks above already report key problems.
  }
  return { checks: results, models };
}
