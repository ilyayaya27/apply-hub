import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, config } from './config.js';

let cached = null;

function parseSimpleYaml(raw) {
  const out = {
    keywords: [],
    exclude_patterns: [],
    markets: [],
    contact: {},
    market_assets: {},
  };
  let section = null;
  let marketSub = null;

  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;

    const marketKeyMatch = line.match(/^\s{2}([a-z_]+):\s*$/);
    if (section === 'market_assets' && marketKeyMatch) {
      marketSub = marketKeyMatch[1];
      if (!out.market_assets[marketSub]) out.market_assets[marketSub] = {};
      continue;
    }

    const assetFieldMatch = line.match(/^\s{4}([a-z_]+):\s*(.*)$/);
    if (section === 'market_assets' && marketSub && assetFieldMatch) {
      let val = assetFieldMatch[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      out.market_assets[marketSub][assetFieldMatch[1]] = val;
      continue;
    }

    if (t.endsWith(':') && !t.includes(' ')) {
      section = t.slice(0, -1);
      marketSub = null;
      if (section === 'contact') out.contact = {};
      if (section === 'market_assets') out.market_assets = {};
      continue;
    }
    if (t.startsWith('- ') && section) {
      const val = t.slice(2).trim();
      if (section === 'keywords') out.keywords.push(val);
      else if (section === 'exclude_patterns') out.exclude_patterns.push(val);
      else if (section === 'markets') out.markets.push(val);
      continue;
    }
    const idx = t.indexOf(':');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    let val = t.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (section === 'contact') out.contact[key] = val;
    else if (key === 'min_fit_score') out.min_fit_score = Number(val);
    else out[key] = val;
  }
  return out;
}

/** @param {ReturnType<typeof loadProfile>} profile */
export function getActiveMarket(profile, env = process.env) {
  const fromEnv = env.JOB_HUB_ACTIVE_MARKET?.trim().toLowerCase();
  if (fromEnv) return fromEnv;
  return String(profile.active_market ?? 'ru').toLowerCase();
}

/** @param {ReturnType<typeof loadProfile>} profile */
export function getMarketAssets(profile, market) {
  const m = (market ?? getActiveMarket(profile)).toLowerCase();
  const fromSection = profile.market_assets?.[m] ?? {};
  return {
    market: m,
    cover_letter_path:
      fromSection.cover_letter_path ??
      profile.cover_letter_path ??
      config.coverLetterPath,
    resume_path:
      fromSection.resume_path ?? profile.resume_path ?? config.resumePath,
    hh_resume_id: fromSection.hh_resume_id ?? profile.hh_resume_id ?? '',
  };
}

export function loadProfile(root = ROOT) {
  if (cached) return cached;
  const path = join(root, 'profile.yaml');
  cached = parseSimpleYaml(readFileSync(path, 'utf8'));
  return cached;
}

export function clearProfileCache() {
  cached = null;
}

export function compileExcludeRegexes(profile) {
  return (profile.exclude_patterns ?? []).map((p) => {
    const m = p.match(/^\/(.+)\/([a-z]*)$/i);
    if (m) return new RegExp(m[1], m[2] || 'i');
    return new RegExp(p, 'i');
  });
}
