import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './config.js';
import { getActiveMarket, loadProfile } from './profile.js';

let cached = null;

export function loadSources(root = ROOT) {
  if (cached) return cached;
  const path = join(root, 'sources.yaml');
  const raw = readFileSync(path, 'utf8');
  const sources = [];
  let current = null;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- id:')) {
      if (current) sources.push(current);
      current = { id: trimmed.slice('- id:'.length).trim() };
      continue;
    }
    if (!current || !trimmed.includes(':')) continue;
    const idx = trimmed.indexOf(':');
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val === 'true') current[key] = true;
    else if (val === 'false') current[key] = false;
    else if (/^\d+$/.test(val)) current[key] = Number(val);
    else if (val) current[key] = val;
  }
  if (current) sources.push(current);

  cached = sources;
  return sources;
}

const matchesMarket = (source, market) => (source.market ?? 'ru') === market;

const resolveMarket = (root, opts = {}) =>
  opts.market ?? getActiveMarket(loadProfile(root));

export function getEnabledTelegramChannels(root = ROOT, opts = {}) {
  const market = resolveMarket(root, opts);
  return loadSources(root)
    .filter(
      (s) =>
        s.type === 'telegram_channel' &&
        s.enabled &&
        s.preview &&
        matchesMarket(s, market),
    )
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

export function getEnabledPlatforms(root = ROOT, opts = {}) {
  const market = resolveMarket(root, opts);
  return loadSources(root).filter(
    (s) =>
      s.type === 'platform' &&
      s.enabled &&
      s.automation_tier === 'apply_auto' &&
      matchesMarket(s, market),
  );
}

export function getSourceById(id, root = ROOT) {
  return loadSources(root).find((s) => s.id === id) ?? null;
}

export function clearSourcesCache() {
  cached = null;
}
