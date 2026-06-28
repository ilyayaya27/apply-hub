import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './config.js';

/** @param {string} [path] */
export const getExternalFeedPath = (path) =>
  path ?? process.env.EXTERNAL_FEED_PATH ?? join(ROOT, 'data', 'external-skips.jsonl');

/**
 * @param {{ route: string, primaryUrl: string | null, postUrl: string, sourceId?: string, postId?: string }} row
 * @param {string} [path]
 */
export function appendExternalSkip(row, path) {
  const file = getExternalFeedPath(path);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(
    file,
    `${JSON.stringify({
      ts: new Date().toISOString(),
      route: row.route,
      primaryUrl: row.primaryUrl,
      postUrl: row.postUrl,
      sourceId: row.sourceId ?? null,
      postId: row.postId ?? null,
    })}\n`,
    'utf8',
  );
}
