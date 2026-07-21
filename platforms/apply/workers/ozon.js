/**
 * Ozon careers (career.ozon.ru) — public JSON API, harvest-only (no live auto-apply here).
 *
 * career.ozon.ru itself sits behind a JS antibot challenge that randomly
 * blocks even a real headless browser (~50% of requests, verified by
 * repeated live probing — not a fixable "wrong header" issue, just an
 * inherent flaky ceiling on this target). The listing DATA, however, comes
 * from a separate, unprotected API host: `job-api.ozon.ru` (NOT
 * `job-ozon-api.t.o3.ru`, which doesn't resolve at all — an earlier probe
 * misread the network trace) — plain `fetch()`, no browser, no WAF.
 *
 * Filters for frontend roles via the `title` field (not description/skills
 * — see workers/getmatch.js's post-mortem on skills-based false
 * positives). `professionalRoles[].title` exists but is too coarse
 * ("Программист, разработчик" covers backend/SQL/frontend alike), so title
 * regex is the right signal here, same as most other career workers.
 *
 * Narrowed to `department=Ozon Tech` (259 of 2089 total listings, 6 pages)
 * — the unfiltered pool is almost entirely non-IT roles (finance, legal,
 * logistics, etc.) and scanning all 42 pages every 6h would be wasteful.
 *
 * ponytail: postUrl uses a generic `vacancy-<hhId>` slug placeholder, not
 * the real SEO slug (the API doesn't return one, and scraping the real
 * slug would need the same flaky browser pass this worker is trying to
 * avoid). Verified the site resolves a placeholder slug fine as long as
 * the antibot check itself passes — the actual apply step (via the
 * existing career-form Playwright adapter) is where antibot flakiness
 * will actually bite, retried naturally via the normal queue/needs_human
 * path, not something to solve here.
 *
 * Run: node cli.js ozon-harvest [limit]
 * Login: not required — public API
 */
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

const API_URL = 'https://job-api.ozon.ru/v2/vacancy';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FRONTEND_ROLE_RE = /frontend|front[- ]?end|фронтенд/i;
const PAGE_LIMIT = 6; // department=Ozon Tech is ~259 items / 50 per page = 6 pages

async function fetchListings() {
  const all = [];
  for (let page = 1; page <= PAGE_LIMIT; page++) {
    const url = `${API_URL}?meta.page=${page}&meta.limit=50&department=${encodeURIComponent('Ozon Tech')}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://career.ozon.ru/vacancy/', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    const data = await res.json();
    const items = data?.items ?? [];
    all.push(...items);
    if (page >= (data?.meta?.totalPages ?? 1)) break;
  }
  return all;
}

export async function runOzon({ limit = 20 } = {}) {
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const candidates = listings.filter((v) => FRONTEND_ROLE_RE.test(v.title ?? ''));

  console.log(`[ozon] ${listings.length} listings, ${candidates.length} frontend-relevant`);

  const results = [];
  for (const v of candidates.slice(0, limit)) {
    const url = `https://career.ozon.ru/vacancy/vacancy-${v.hhId}`;
    const rawText = `${v.title}\n${v.department ?? ''}\n${v.city ?? ''} · ${(v.workFormat ?? []).join(', ')} · ${v.experience ?? ''}`;

    const out = enqueueFromHarvestPost({
      sourceId: 'ozon',
      postId: String(v.hhId),
      postUrl: url,
      rawText,
      links: [url],
      dryRun: true,
      skipFitCheck: false,
    });

    const r = out.results[0];
    console.log(`[ozon] ${r.action}  ${v.title}`);
    results.push({ id: v.hhId, name: v.title, ...r });
  }

  const queued = results.filter((r) => r.action === 'would_apply').length;
  console.log(`[ozon] done: scanned=${listings.length} candidates=${candidates.length} would_apply=${queued}`);

  return { ok: true, scanned: listings.length, candidates: candidates.length, processed: results.length, results };
}
