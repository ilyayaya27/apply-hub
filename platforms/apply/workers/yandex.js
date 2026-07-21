/**
 * Yandex careers (yandex.ru/jobs) — public JSON API, harvest-only (no live auto-apply here).
 *
 * Fetches yandex.ru's own vacancy-listing API and filters for frontend roles via the
 * site's own `professions` taxonomy (query param, not a keyword scan over
 * description/skills — see workers/getmatch.js's post-mortem on skills-based false
 * positives), then routes each listing through the same enqueue-from-harvest pipeline
 * used by other harvest workers (profile.yaml fit score + exclude_patterns, dedup via
 * lib/store.js, apply-route classification via adapters/platforms/hosts.js — matches
 * `yandex.ru/jobs` to `yandex_careers`, which has `allowAutoSubmit: true` in specs.js).
 * dryRun is always true here — this worker only harvests and classifies; live apply
 * stays gated behind apply-next/apply-dispatcher.
 *
 * API note: unlike career.rwb.ru, this endpoint does NOT return a per-item role field
 * (the "vacancy" object only has cities/skills/work_modes) — the site's role
 * classification is only exposed as the `professions` query filter. So the reliable-role
 * filter happens server-side (professions=frontend-developer) rather than as a local
 * regex; `candidates` below is the full result set because it's already role-filtered.
 * No WAF/bot-UA blocking observed (plain curl UA and a self-identifying bot UA both got
 * 200s) — a browser UA + Referer is still set defensively, matching the rwb pattern.
 *
 * Some listings redirect to an external application system (`redirect_url` non-null);
 * we use that as the postUrl when present, else the site's own vacancy detail page.
 *
 * Run: node cli.js yandex-harvest [limit]
 * Login: not required — public API
 */
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

const API_URL = 'https://yandex.ru/jobs/api/jobs/publications?professions=frontend-developer&page=1&page_size=100&lang=ru';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchListings() {
  const res = await fetch(API_URL, {
    headers: { 'User-Agent': UA, Referer: 'https://yandex.ru/jobs/vacancies', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${API_URL}`);
  const data = await res.json();
  return data?.results ?? [];
}

export async function runYandex({ limit = 20 } = {}) {
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  // Already role-filtered server-side via professions=frontend-developer (see header note).
  const candidates = listings;

  console.log(`[yandex] ${listings.length} listings, ${candidates.length} frontend-relevant`);

  const results = [];
  for (const v of candidates.slice(0, limit)) {
    const title = (v.title ?? '').replace(/&nbsp;/g, ' ');
    const url = v.redirect_url || `https://yandex.ru/jobs/vacancies/${v.publication_slug_url}`;
    const cities = (v.vacancy?.cities ?? []).map((c) => c.name).join(', ');
    const rawText = `${title}\n${v.short_summary ?? ''}\n${cities}`;

    const out = enqueueFromHarvestPost({
      sourceId: 'yandex',
      postId: String(v.id),
      postUrl: url,
      rawText,
      links: [url],
      dryRun: true,
      skipFitCheck: false,
    });

    const r = out.results[0];
    console.log(`[yandex] ${r.action}  ${title}`);
    results.push({ id: v.id, name: title, ...r });
  }

  const queued = results.filter((r) => r.action === 'would_apply').length;
  console.log(`[yandex] done: scanned=${listings.length} candidates=${candidates.length} would_apply=${queued}`);

  return { ok: true, scanned: listings.length, candidates: candidates.length, processed: results.length, results };
}
