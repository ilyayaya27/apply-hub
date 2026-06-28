import { existsSync, readFileSync } from 'node:fs';
import { config } from './config.js';
import { getDb, resetDbForTests } from './db.js';

const todayKey = () => new Date().toISOString().slice(0, 10);

function db() {
  return getDb(config.dbPath);
}

export const vacancyKey = (channel, postId) => `${channel}:${postId}`;

export function platformVacancyKey(platformId, externalId) {
  return `${platformId}:${externalId}`;
}

export function fuzzyDedupKey(title, company) {
  const norm = (s) =>
    String(s ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return `fuzzy:${norm(title)}|${norm(company)}`;
}

export function migrateFromStateJson(statePath = config.statePath) {
  if (!existsSync(statePath)) return { migrated: 0 };
  let state;
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return { migrated: 0 };
  }
  const database = db();
  let count = 0;
  const insertSeen = database.prepare(
    'INSERT OR IGNORE INTO seen (dedup_key, first_seen_at) VALUES (?, ?)',
  );
  for (const [key, val] of Object.entries(state.seen ?? {})) {
    insertSeen.run(key, val?.at ?? new Date().toISOString());
    count += 1;
  }
  return { migrated: count };
}

export function ensureMigrated() {
  if (process.env.VITEST === 'true' || process.env.JOB_HUB_SKIP_STATE_MIGRATE === '1') {
    return;
  }
  const database = db();
  const row = database.prepare('SELECT COUNT(*) AS c FROM seen').get();
  if (row.c === 0) migrateFromStateJson();
}

export const isSeen = (key) => {
  ensureMigrated();
  const row = db().prepare('SELECT 1 FROM seen WHERE dedup_key = ?').get(key);
  return Boolean(row);
};

export const markSeen = (key, payload = {}) => {
  ensureMigrated();
  db()
    .prepare('INSERT OR IGNORE INTO seen (dedup_key, first_seen_at) VALUES (?, ?)')
    .run(key, payload.at ?? new Date().toISOString());
};

export function countApplicationsToday(route = null) {
  const day = todayKey();
  const successOnly = ` AND method != 'needs_human'`;
  if (route) {
    const row = db()
      .prepare(
        `SELECT COUNT(*) AS c FROM applications
         WHERE date(applied_at) = ? AND method = ?${successOnly}`,
      )
      .get(day, route);
    return row?.c ?? 0;
  }
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS c FROM applications WHERE date(applied_at) = ?${successOnly}`,
    )
    .get(day);
  return row?.c ?? 0;
}

export const canApplyToday = () =>
  countApplicationsToday() < config.maxAppliesPerDay;

export function canApplyRouteToday(route) {
  const limits = {
    form: config.maxFormAppliesPerDay,
    email: config.maxEmailAppliesPerDay,
  };
  const limit = limits[route];
  if (!limit) return canApplyToday();
  return countApplicationsToday(route) < limit && canApplyToday();
}

export const incrementAppliesToday = () => {
  /* счётчик ведётся через applications */
};

export function isCooldown(key) {
  const row = db().prepare('SELECT until_ts FROM cooldowns WHERE key = ?').get(key);
  if (!row) return false;
  return row.until_ts > Date.now();
}

export function setCooldown(key, minutes) {
  const until = Date.now() + minutes * 60 * 1000;
  db()
    .prepare(
      'INSERT INTO cooldowns (key, until_ts) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET until_ts = excluded.until_ts',
    )
    .run(key, until);
}

export function upsertVacancy(v) {
  db()
    .prepare(
      `INSERT INTO vacancies (id, source, external_id, url, title, company, fit_score, route, status, raw_text, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         fit_score = excluded.fit_score,
         route = excluded.route,
         status = excluded.status,
         updated_at = datetime('now')`,
    )
    .run(
      v.id,
      v.source,
      v.externalId ?? null,
      v.url ?? null,
      v.title ?? null,
      v.company ?? null,
      v.fitScore ?? null,
      v.route ?? null,
      v.status ?? 'new',
      v.rawText ?? null,
    );
}

export const enqueue = (entry) => {
  ensureMigrated();
  const id = entry.key;
  const row = db().prepare(`SELECT status FROM vacancies WHERE id = ?`).get(id);
  const blocked = new Set([
    'queued',
    'processing',
    'applied',
    'needs_human',
    'failed',
  ]);
  if (row?.status && blocked.has(row.status)) return false;

  upsertVacancy({
    id,
    source: entry.channel ?? entry.source ?? 'unknown',
    externalId: entry.postId ?? entry.externalId,
    url: entry.primaryUrl ?? entry.applyUrl ?? entry.url,
    title: entry.title,
    company: entry.company,
    fitScore: entry.fitScore,
    route: entry.route,
    status: 'queued',
    rawText: entry.rawText,
  });
  return true;
};

export const listQueue = (status = 'queued') => {
  ensureMigrated();
  const rows = db()
    .prepare(
      `SELECT id AS key, source AS channel, external_id AS postId, url, title, company,
              fit_score AS fitScore, route, status, created_at AS at
       FROM vacancies WHERE status = ? ORDER BY fit_score DESC, created_at ASC LIMIT 100`,
    )
    .all(status === 'pending' ? 'queued' : status);
  return rows.map((r) => ({ ...r, status: status === 'pending' ? 'pending' : r.status }));
};

/**
 * Release vacancies stuck in processing (crash mid-apply, killed CLI).
 * @param {number} [staleMinutes=15] — 0 releases all processing immediately
 * @returns {number}
 */
export function releaseStaleProcessing(staleMinutes = 15) {
  const database = db();
  if (staleMinutes <= 0) {
    return database
      .prepare(
        `UPDATE vacancies SET status = 'queued', updated_at = datetime('now') WHERE status = 'processing'`,
      )
      .run().changes;
  }
  return database
    .prepare(
      `UPDATE vacancies SET status = 'queued', updated_at = datetime('now')
       WHERE status = 'processing'
         AND updated_at < datetime('now', ?)`,
    )
    .run(`-${staleMinutes} minutes`).changes;
}

/**
 * Dev/fixture: allow re-ingest of the same posts (clears seen + vacancy row).
 * @param {string[]} keys
 */
export function resetKeysForReingest(keys) {
  const database = db();
  const delSeen = database.prepare(`DELETE FROM seen WHERE dedup_key = ?`);
  const delVac = database.prepare(`DELETE FROM vacancies WHERE id = ?`);
  for (const key of keys) {
    delSeen.run(key);
    delVac.run(key);
  }
}

export function dequeueNext() {
  releaseStaleProcessing(15);
  const autoOnly = config.autoApply;
  const routeFilter = autoOnly ? ` AND route IN ('form', 'email')` : '';
  const row = db()
    .prepare(
      `SELECT id AS key, source, external_id AS postId, url, title, company,
              fit_score AS fitScore, route, raw_text AS rawText
       FROM vacancies WHERE status = 'queued'${routeFilter}
       ORDER BY fit_score DESC, created_at ASC LIMIT 1`,
    )
    .get();
  if (!row) return null;
  db()
    .prepare(`UPDATE vacancies SET status = 'processing', updated_at = datetime('now') WHERE id = ?`)
    .run(row.key);
  return { ...row, status: 'processing' };
}

export function releaseProcessing(key, status = 'queued') {
  db()
    .prepare(`UPDATE vacancies SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, key);
}

export const markApplied = (key, noteOrMeta = '', methodArg = 'manual') => {
  let note = '';
  let method = methodArg;
  if (
    noteOrMeta &&
    typeof noteOrMeta === 'object' &&
    !Array.isArray(noteOrMeta)
  ) {
    note = noteOrMeta.note ?? '';
    method = noteOrMeta.method ?? methodArg;
  } else {
    note = String(noteOrMeta ?? '');
  }

  db()
    .prepare(`UPDATE vacancies SET status = 'applied', updated_at = datetime('now') WHERE id = ?`)
    .run(key);
  db()
    .prepare(
      `INSERT INTO applications (vacancy_id, method, note) VALUES (?, ?, ?)`,
    )
    .run(key, method, note);
};

export function markFailed(key, error, method = 'auto') {
  db()
    .prepare(`UPDATE vacancies SET status = 'failed', updated_at = datetime('now') WHERE id = ?`)
    .run(key);
  db()
    .prepare(`INSERT INTO applications (vacancy_id, method, error) VALUES (?, ?, ?)`)
    .run(key, method, error);
}

export function markNeedsHuman(key, note = '') {
  db()
    .prepare(`UPDATE vacancies SET status = 'needs_human', updated_at = datetime('now') WHERE id = ?`)
    .run(key);
  db()
    .prepare(`INSERT INTO applications (vacancy_id, method, note) VALUES (?, 'needs_human', ?)`)
    .run(key, note);
}

export const appendHistory = (entry) => {
  if (entry.status === 'applied') markApplied(entry.key, entry.note ?? '', entry.method ?? 'log');
  else if (entry.status === 'failed') markFailed(entry.key, entry.note ?? entry.error ?? '', entry.method);
  else if (entry.status === 'needs_human') markNeedsHuman(entry.key, entry.note ?? '');
};

export function getDailyReport() {
  const day = todayKey();
  const found = db()
    .prepare(`SELECT COUNT(*) AS c FROM vacancies WHERE date(created_at) = ?`)
    .get(day)?.c ?? 0;
  const applied = db()
    .prepare(
      `SELECT COUNT(*) AS c FROM applications WHERE date(applied_at) = ? AND method != 'needs_human'`,
    )
    .get(day)?.c ?? 0;
  const failed = db()
    .prepare(`SELECT COUNT(*) AS c FROM vacancies WHERE status = 'failed' AND date(updated_at) = ?`)
    .get(day)?.c ?? 0;
  const queued = db()
    .prepare(`SELECT COUNT(*) AS c FROM vacancies WHERE status = 'queued'`)
    .get()?.c ?? 0;
  const needsHuman = db()
    .prepare(`SELECT COUNT(*) AS c FROM vacancies WHERE status = 'needs_human'`)
    .get()?.c ?? 0;
  return { day, found, applied, failed, queued, needsHuman };
}

export const countAppliedToday = countApplicationsToday;

export { resetDbForTests, getDb };

/** @internal test helper */
export const resetStateForTests = () => {
  resetDbForTests();
  getDb(config.dbPath);
};
