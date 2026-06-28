import { careerPlatformId } from '../adapters/platforms/hosts.js';
import { config } from './config.js';
import { getDb } from './db.js';

/**
 * Re-route vacancies whose URL is a known career platform but route ≠ form (e.g. manual before SSOT update).
 * @param {{ dryRun?: boolean }} opts
 */
export function repairCareerRoutes({ dryRun = true } = {}) {
  const database = getDb(config.dbPath);
  const rows = database
    .prepare(`SELECT id, url, route, status FROM vacancies WHERE url IS NOT NULL AND url != ''`)
    .all();

  /** @type {{ id: string, url: string, from: string, platformId: string }[]} */
  const actions = [];

  for (const row of rows) {
    const platformId = careerPlatformId(row.url);
    if (!platformId || row.route === 'form') continue;
    actions.push({
      id: row.id,
      url: row.url,
      from: row.route,
      platformId,
    });
  }

  if (dryRun) {
    return { dryRun: true, count: actions.length, actions };
  }

  const update = database.prepare(
    `UPDATE vacancies SET route = 'form', updated_at = datetime('now') WHERE id = ?`,
  );
  for (const a of actions) update.run(a.id);

  return { dryRun: false, fixed: actions.length, actions };
}
