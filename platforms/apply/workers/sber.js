/**
 * Sber careers (rabota.sber.ru) — public JSON API, harvest-only (no live auto-apply here).
 *
 * Fetches rabota.sber.ru's own candidate-facing publications API, filters for
 * frontend roles via the listing's `title` field (not description/skills —
 * see workers/getmatch.js's post-mortem on skills-based false positives),
 * then routes each listing through the same enqueue-from-harvest pipeline
 * used by Telegram/career-platform harvest (profile.yaml fit score +
 * exclude_patterns, dedup via lib/store.js, apply-route classification via
 * adapters/platforms/hosts.js — matches `rabota.sber.ru` to `sber_careers`,
 * which has `allowAutoSubmit: true` in specs.js). dryRun is always true here
 * — this worker only harvests and classifies; live apply stays gated behind
 * apply-next/apply-dispatcher.
 *
 * The API has no server-side title/specialization filter that actually
 * narrows results (tried `specializationIds=` — ignored), so we page through
 * newest listings client-side, same as rwb.js.
 *
 * Run: node cli.js sber-harvest [limit]
 * Login: not required — public API
 */
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

const API_URL = 'https://rabota.sber.ru/public/app-candidate-public-api-gateway/api/v1/publications';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FRONTEND_ROLE_RE = /frontend|front[- ]?end/i;
const PAGE_SIZE = 100; // server caps take= at 100 regardless of requested value
// ponytail: only scans the newest 500 of ~3600 total listings (5 pages) — no
// server-side category filter exists, so exhaustive scan means 36 requests.
// Bump PAGE_LIMIT if frontend roles are getting missed in older listings.
const PAGE_LIMIT = 5;

async function fetchListings() {
  const all = [];
  for (let page = 0; page < PAGE_LIMIT; page++) {
    const url = `${API_URL}?skip=${page * PAGE_SIZE}&take=${PAGE_SIZE}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://rabota.sber.ru/search/', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    const data = await res.json();
    const items = data?.data?.vacancies ?? [];
    all.push(...items);
    if (items.length < PAGE_SIZE) break; // reached the end
  }
  return all;
}

export async function runSber({ limit = 20 } = {}) {
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const candidates = listings.filter((v) => FRONTEND_ROLE_RE.test(v.title ?? ''));

  console.log(`[sber] ${listings.length} listings, ${candidates.length} frontend-relevant`);

  const results = [];
  for (const v of candidates.slice(0, limit)) {
    // canonical slug isn't needed — /search/x-<internalId>/ 307-redirects to it.
    const url = `https://rabota.sber.ru/search/vacancy-${v.internalId}/`;
    const rawText = `${v.title}\n${v.specialization ?? ''}\n${v.city ?? ''} · ${v.region ?? ''}\n${v.introduction ?? ''}`;

    const out = enqueueFromHarvestPost({
      sourceId: 'sber',
      postId: String(v.internalId),
      postUrl: url,
      rawText,
      links: [url],
      dryRun: true,
      skipFitCheck: false,
    });

    const r = out.results[0];
    console.log(`[sber] ${r.action}  ${v.title}`);
    results.push({ id: v.internalId, name: v.title, ...r });
  }

  const queued = results.filter((r) => r.action === 'would_apply').length;
  console.log(`[sber] done: scanned=${listings.length} candidates=${candidates.length} would_apply=${queued}`);

  return { ok: true, scanned: listings.length, candidates: candidates.length, processed: results.length, results };
}
