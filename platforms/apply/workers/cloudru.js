/**
 * Cloud.ru careers — public JSON API, harvest-only (no live auto-apply here).
 *
 * Fetches cloud.ru/career's own vacancy-list API (same host that backs the
 * app-router career site — data is normally streamed to the page via RSC
 * flight payload, but the endpoint itself is public JSON), filters for
 * frontend roles via the `position` field (title, not free-text
 * body/requirements/conditions — see workers/getmatch.js's post-mortem on
 * skills-based false positives), then routes each listing through the same
 * enqueue-from-harvest pipeline used by other career-platform harvest
 * workers (profile.yaml fit score + exclude_patterns, dedup via
 * lib/store.js, apply-route classification via adapters/platforms/hosts.js
 * — matches `cloud.ru` to `cloudru_careers`, which has `allowAutoSubmit:
 * true` in specs.js). dryRun is always true here — this worker only
 * harvests and classifies; live apply stays gated behind
 * apply-next/apply-dispatcher.
 *
 * Run: node cli.js cloudru-harvest [limit]
 * Login: not required — public API, no WAF/UA gating observed
 */
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

const API_URL = 'https://api.cloud.ru/career/v1/vacancies';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FRONTEND_ROLE_RE = /frontend|front[- ]?end/i;

async function fetchListings() {
  const res = await fetch(API_URL, {
    headers: { 'User-Agent': UA, Referer: 'https://cloud.ru/career/vacancies', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${API_URL}`);
  const data = await res.json();
  return data?.data ?? [];
}

export async function runCloudru({ limit = 20 } = {}) {
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const open = listings.filter((v) => !v.isClosed);
  const candidates = open.filter((v) => FRONTEND_ROLE_RE.test(v.position ?? ''));

  console.log(`[cloudru] ${listings.length} listings, ${candidates.length} frontend-relevant`);

  const results = [];
  for (const v of candidates.slice(0, limit)) {
    const url = `https://cloud.ru/career/vacancies/${v.id}`;
    const rawText = `${v.position}\n${v.unit?.name ?? ''}\n${v.work_format?.name ?? ''} · ${v.experience?.name ?? ''}`;

    const out = enqueueFromHarvestPost({
      sourceId: 'cloudru',
      postId: String(v.id),
      postUrl: url,
      rawText,
      links: [url],
      dryRun: true,
      skipFitCheck: false,
    });

    const r = out.results[0];
    console.log(`[cloudru] ${r.action}  ${v.position}`);
    results.push({ id: v.id, name: v.position, ...r });
  }

  const queued = results.filter((r) => r.action === 'would_apply').length;
  console.log(`[cloudru] done: scanned=${listings.length} candidates=${candidates.length} would_apply=${queued}`);

  return { ok: true, scanned: listings.length, candidates: candidates.length, processed: results.length, results };
}
