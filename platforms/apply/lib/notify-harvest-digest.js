import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.js';
import { buildHumanDigestText } from './human-digest.js';
import { sendTelegramNotify } from './notify-telegram.js';

/**
 * @param {string} [harvestPath]
 */
export async function notifyHarvestHumanDigest(harvestPath) {
  const path = harvestPath ?? join(ROOT, '..', 'telegram', 'logs', 'harvest-latest.json');
  if (!existsSync(path)) {
    return { ok: false, skipped: 'no_report', path };
  }

  let report;
  try {
    report = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { ok: false, skipped: 'invalid_json', path };
  }

  const rows = report.applyDryRun ?? [];
  const text = buildHumanDigestText(rows);
  if (!text) {
    return { ok: true, skipped: 'empty_human_queue', path };
  }

  return sendTelegramNotify(text, { kind: 'needs_human' });
}
