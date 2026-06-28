import { careerPlatformId } from '../adapters/platforms/hosts.js';

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
export const getFunnelMetrics = (db) => {
  const total = db.prepare(`SELECT COUNT(*) AS c FROM vacancies`).get()?.c ?? 0;
  const applied =
    db.prepare(`SELECT COUNT(*) AS c FROM vacancies WHERE status = 'applied'`).get()?.c ?? 0;
  const queued =
    db.prepare(`SELECT COUNT(*) AS c FROM vacancies WHERE status = 'queued'`).get()?.c ?? 0;
  const needsHuman =
    db.prepare(`SELECT COUNT(*) AS c FROM vacancies WHERE status = 'needs_human'`).get()?.c ??
    0;
  const failed =
    db.prepare(`SELECT COUNT(*) AS c FROM vacancies WHERE status = 'failed'`).get()?.c ?? 0;

  return {
    total,
    queued,
    applied,
    needsHuman,
    failed,
    conversionRate: total ? Math.round((applied / total) * 1000) / 10 : 0,
  };
};

/**
 * @param {import('node:sqlite').DatabaseSync} db
 */
export const getPlatformMetrics = (db) => {
  const rows = db.prepare(`SELECT url, status, route FROM vacancies`).all();
  /** @type {Record<string, Record<string, number>>} */
  const byPlatform = {};

  for (const row of rows) {
    const id = careerPlatformId(row.url) ?? row.route ?? 'unknown';
    if (!byPlatform[id]) byPlatform[id] = {};
    byPlatform[id][row.status] = (byPlatform[id][row.status] ?? 0) + 1;
  }

  return byPlatform;
};
