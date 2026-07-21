/**
 * Beeline careers (job.beeline.ru) — public JSON API, harvest-only (no live auto-apply here).
 *
 * Fetches job.beeline.ru's own vacancy-list API, filters for frontend roles via
 * the site's own `role` classification (more reliable than a keyword scan over
 * description/skills — see workers/getmatch.js's post-mortem on skills-based
 * false positives), then routes each listing through the same enqueue-from-harvest
 * pipeline used by Telegram/career-platform harvest (profile.yaml fit score +
 * exclude_patterns, dedup via lib/store.js, apply-route classification via
 * adapters/platforms/hosts.js — matches `job.beeline.ru` to `beeline_careers`,
 * which has `allowAutoSubmit: true` in specs.js). dryRun is always true here —
 * this worker only harvests and classifies; live apply stays gated behind
 * apply-next/apply-dispatcher.
 *
 * Run: node cli.js beeline-harvest [limit]
 * Login: not required — public API
 */
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

const API_URL = 'https://job.beeline.ru/api/v1/vacancies/?limit=2000&offset=0';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FRONTEND_ROLE_RE = /frontend|front[- ]?end/i;

async function fetchListings() {
  const res = await fetch(API_URL, {
    headers: { 'User-Agent': UA, Referer: 'https://job.beeline.ru/vacancies', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${API_URL}`);
  const data = await res.json();
  return data?.results ?? [];
}

export async function runBeeline({ limit = 20 } = {}) {
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const candidates = listings.filter((v) => FRONTEND_ROLE_RE.test(v.role ?? ''));

  console.log(`[beeline] ${listings.length} listings, ${candidates.length} frontend-relevant`);

  const results = [];
  for (const v of candidates.slice(0, limit)) {
    const url = `https://job.beeline.ru/vacancies/${v.id}`;
    const rawText = `${v.name}\n${v.role ?? ''}\n${(v.city ?? []).join(', ')} · ${(v.work_format ?? []).join(', ')} · ${v.grade ?? ''}`;

    const out = enqueueFromHarvestPost({
      sourceId: 'beeline',
      postId: String(v.id),
      postUrl: url,
      rawText,
      links: [url],
      dryRun: true,
      skipFitCheck: false,
    });

    const r = out.results[0];
    console.log(`[beeline] ${r.action}  ${v.name}`);
    results.push({ id: v.id, name: v.name, ...r });
  }

  const queued = results.filter((r) => r.action === 'would_apply').length;
  console.log(`[beeline] done: scanned=${listings.length} candidates=${candidates.length} would_apply=${queued}`);

  return { ok: true, scanned: listings.length, candidates: candidates.length, processed: results.length, results };
}
