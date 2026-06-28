import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config, ROOT, getDbPath } from './config.js';
import { getDb } from './db.js';
import { getApplyStats } from './apply-dispatcher.js';
import { buildHumanDigestText } from './human-digest.js';
import { getExternalFeedPath } from './external-feed.js';

const defaultHarvestReport = join(ROOT, '..', 'telegram', 'logs', 'harvest-latest.json');

/** @param {import('node:sqlite').DatabaseSync} db */
const groupBy = (db, sql) =>
  Object.fromEntries(db.prepare(sql).all().map((r) => [r.k, r.c]));

/**
 * @param {{ harvestPath?: string }} [opts]
 */
export function buildAuditReport(opts = {}) {
  const db = getDb(getDbPath());
  const byStatus = groupBy(
    db,
    `SELECT status AS k, COUNT(*) AS c FROM vacancies GROUP BY status`,
  );
  const byRoute = groupBy(
    db,
    `SELECT COALESCE(route, 'unknown') AS k, COUNT(*) AS c FROM vacancies GROUP BY route`,
  );

  const harvestPath = opts.harvestPath ?? defaultHarvestReport;
  /** @type {Record<string, unknown> | null} */
  let harvest = null;
  if (existsSync(harvestPath)) {
    try {
      harvest = JSON.parse(readFileSync(harvestPath, 'utf8'));
    } catch {
      harvest = null;
    }
  }

  const applyDryRun = /** @type {Array<Record<string, unknown>>} */ (
    harvest?.applyDryRun ?? []
  );
  const humanDigest = buildHumanDigestText(applyDryRun);
  const feedPath = getExternalFeedPath();
  const feedExists = existsSync(feedPath);

  return {
    dbPath: getDbPath(),
    harvestPath,
    feedPath,
    feedExists,
    queue: byStatus,
    routes: byRoute,
    applyStats: getApplyStats(),
    harvestSummary: harvest?.summary ?? null,
    humanDigest,
    dryRun: config.dryRun,
    autoApply: config.autoApply,
  };
}

/** @param {ReturnType<typeof buildAuditReport>} report */
export function formatAuditReport(report) {
  const lines = [
    '📊 Apply hub audit',
    `DB: ${report.dbPath}`,
    `Dry-run: ${report.dryRun} | AUTO_APPLY: ${report.autoApply}`,
    '',
    'Queue by status:',
    ...Object.entries(report.queue).map(([k, v]) => `  ${k}: ${v}`),
    '',
    'By route:',
    ...Object.entries(report.routes).map(([k, v]) => `  ${k}: ${v}`),
    '',
    `Applied today: ${report.applyStats.appliedToday ?? 0} | queue left: ${report.applyStats.queueLeft ?? 0}`,
  ];

  if (report.harvestSummary) {
    const s = report.harvestSummary;
    lines.push(
      '',
      `Last harvest (${report.harvestPath}):`,
      `  scanned=${s.scanned} matched=${s.matched} rejected=${s.rejected}`,
    );
  }

  if (report.humanDigest) {
    lines.push('', report.humanDigest);
  }

  lines.push('', `External skip feed: ${report.feedPath} (${report.feedExists ? 'exists' : 'empty'})`);

  return lines.join('\n');
}
