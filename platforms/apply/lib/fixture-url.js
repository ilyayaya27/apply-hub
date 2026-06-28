import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './config.js';

/** @type {Record<string, string>} */
const FIXTURE_URL_ALIASES = {
  'https://forms.gle/rvc-smoke-simple-form': join(ROOT, 'fixtures', 'simple-form.html'),
};

/**
 * Resolve public apply URLs to local fixture files for smoke tests / dry-run.
 * @param {string | null | undefined} rawUrl
 * @returns {string | null | undefined}
 */
export const resolveApplyUrl = (rawUrl) => {
  if (!rawUrl) return rawUrl;
  const normalized = String(rawUrl).trim();
  const localPath = FIXTURE_URL_ALIASES[normalized];
  if (localPath) return pathToFileURL(localPath).href;
  return rawUrl;
};
