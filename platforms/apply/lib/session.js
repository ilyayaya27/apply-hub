import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SESSIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'sessions');

/**
 * Возвращает путь к сохранённому Playwright storageState для платформы,
 * или undefined если сессии нет.
 * @param {string} platformId
 * @returns {string | undefined}
 */
export function loadSessionState(platformId) {
  const path = join(SESSIONS_DIR, `${platformId}.json`);
  return existsSync(path) ? path : undefined;
}
