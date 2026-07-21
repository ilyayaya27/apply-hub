/**
 * RWB (Wildberries) careers — public JSON API, harvest-only (no live auto-apply here).
 *
 * Fetches career.rwb.ru's own vacancy-list API, filters for frontend roles via
 * the site's own `direction_role_title` classification (more reliable than a
 * keyword scan over description/skills — see workers/getmatch.js's post-mortem
 * on skills-based false positives), then routes each listing through the same
 * enqueue-from-harvest pipeline used by Telegram/career-platform harvest
 * (profile.yaml fit score + exclude_patterns, dedup via lib/store.js,
 * apply-route classification via adapters/platforms/hosts.js — matches
 * `career.rwb.ru` to `rwb_careers`, which has `allowAutoSubmit: true` in
 * specs.js). dryRun is always true here — this worker only harvests and
 * classifies; live apply stays gated behind apply-next/apply-dispatcher.
 *
 * Run: node cli.js rwb-harvest [limit]
 * Login: not required — public API
 */
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

const API_URL = 'https://career.rwb.ru/crm-api/api/v1/pub/vacancies?limit=500&offset=0';
// Самоидентифицирующийся UA ("apply-hub/1.0 ... bot") блокируется WAF (403) —
// в отличие от remoteok/HN этот эндпоинт требует браузероподобный UA.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FRONTEND_ROLE_RE = /frontend|front[- ]?end/i;

async function fetchListings() {
  const res = await fetch(API_URL, {
    headers: { 'User-Agent': UA, Referer: 'https://career.rwb.ru/vacancies', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${API_URL}`);
  const data = await res.json();
  return data?.data?.items ?? [];
}

export async function runRwb({ limit = 20 } = {}) {
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const candidates = listings.filter((v) => FRONTEND_ROLE_RE.test(v.direction_role_title ?? ''));

  console.log(`[rwb] ${listings.length} listings, ${candidates.length} frontend-relevant`);

  const results = [];
  for (const v of candidates.slice(0, limit)) {
    const url = `https://career.rwb.ru/vacancies/${v.id}`;
    const rawText = `${v.name}\n${v.direction_role_title ?? ''} · ${v.direction_title ?? ''}\n${v.city_title ?? ''} · ${v.experience_type_title ?? ''}`;

    const out = enqueueFromHarvestPost({
      sourceId: 'rwb',
      postId: String(v.id),
      postUrl: url,
      rawText,
      links: [url],
      dryRun: true,
      skipFitCheck: false,
    });

    const r = out.results[0];
    console.log(`[rwb] ${r.action}  ${v.name}`);
    results.push({ id: v.id, name: v.name, ...r });
  }

  const queued = results.filter((r) => r.action === 'would_apply').length;
  console.log(`[rwb] done: scanned=${listings.length} candidates=${candidates.length} would_apply=${queued}`);

  return { ok: true, scanned: listings.length, candidates: candidates.length, processed: results.length, results };
}
