/** @typedef {{ action?: string, route?: string, primaryUrl?: string | null, postUrl?: string }} DigestRow */

export const HUMAN_ROUTES = new Set(['manual', 'telegram', 'rvc_bot']);

/** @param {DigestRow} row */
export const isHumanApplyRow = (row) =>
  row.action === 'needs_human' || HUMAN_ROUTES.has(row.route ?? '');

/**
 * @param {DigestRow[]} rows
 * @returns {string[]}
 */
export const formatHumanDigestLines = (rows) =>
  rows.filter(isHumanApplyRow).map((r) => {
    const route = r.route ?? '?';
    const target = r.primaryUrl ?? '—';
    const post = r.postUrl ?? '—';
    return `• [${route}] ${target} — ${post}`;
  });

/**
 * @param {DigestRow[]} rows
 */
export const buildHumanDigestText = (rows) => {
  const lines = formatHumanDigestLines(rows);
  if (lines.length === 0) return '';
  return ['👤 Ручная очередь (manual / TG / bot):', ...lines].join('\n');
};
