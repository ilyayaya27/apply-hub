import { config } from './config.js';
import { getDb } from './db.js';
import { isCandidateResumePost } from './resume-post.js';

const REPAIR_NOTE = 'skip_resume_post';
const AUTO_ROUTES = new Set(['form', 'email']);

/**
 * Retro-scan DB for candidate #резюме posts wrongly queued or applied.
 * @param {{ dryRun?: boolean }} opts
 */
export function repairResumePosts({ dryRun = true } = {}) {
  const database = getDb(config.dbPath);
  const rows = database
    .prepare(`SELECT id, status, route, raw_text FROM vacancies WHERE raw_text IS NOT NULL AND raw_text != ''`)
    .all();

  /** @type {{ id: string, action: string, from: string, route: string | null }[]} */
  const actions = [];

  for (const row of rows) {
    if (!isCandidateResumePost(row.raw_text)) continue;

    if (row.status === 'needs_human') continue;

    if (row.status === 'applied') {
      actions.push({
        id: row.id,
        action: 'revert_applied',
        from: row.status,
        route: row.route,
      });
      continue;
    }

    if (row.status === 'processing') {
      actions.push({
        id: row.id,
        action: 'mark_needs_human',
        from: row.status,
        route: row.route,
      });
      continue;
    }

    if (row.status === 'queued') {
      actions.push({
        id: row.id,
        action: 'mark_needs_human',
        from: row.status,
        route: row.route,
      });
    }
  }

  if (dryRun) {
    return {
      dryRun: true,
      count: actions.length,
      autoRouteCount: actions.filter((a) => AUTO_ROUTES.has(a.route)).length,
      actions,
    };
  }

  const updateVac = database.prepare(
    `UPDATE vacancies SET status = 'needs_human', updated_at = datetime('now') WHERE id = ?`,
  );
  const delApps = database.prepare(
    `DELETE FROM applications WHERE vacancy_id = ? AND method != 'needs_human'`,
  );
  const insertNote = database.prepare(
    `INSERT INTO applications (vacancy_id, method, note) VALUES (?, 'needs_human', ?)`,
  );

  for (const a of actions) {
    if (a.action === 'revert_applied') {
      delApps.run(a.id);
      updateVac.run(a.id);
      insertNote.run(a.id, `${REPAIR_NOTE} (repair: was wrongly applied)`);
    } else {
      updateVac.run(a.id);
      insertNote.run(a.id, `${REPAIR_NOTE} (repair: retro scan)`);
    }
  }

  return {
    dryRun: false,
    fixed: actions.length,
    autoRouteCount: actions.filter((a) => AUTO_ROUTES.has(a.route)).length,
    actions,
  };
}
