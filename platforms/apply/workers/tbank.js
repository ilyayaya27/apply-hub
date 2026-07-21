/**
 * T-Bank careers — public IT vacancies page, harvest-only (no live auto-apply here).
 *
 * No standalone JSON REST endpoint was found: the "real" catalog API
 * (POST https://www.tbank.ru/pfpjobs/papi/getVacancies) requires a GraphQL
 * filter object built client-side and returns an empty list for any
 * hand-crafted payload we tried — its unified-filters feature flag appears
 * off for anonymous requests right now. What IS reliably available without
 * login is the same JSON the page itself renders with: www.tbank.ru embeds
 * the full SSR state (including the vacancy list actually shown to a human
 * visitor) in a `<script id="__TRAMVAI_STATE__">` tag on
 * /career/vacancies/it/. We scrape that blob instead of re-deriving the
 * GraphQL filter.
 *
 * Filters for frontend roles via `title` (the only role-ish field this feed
 * exposes — no separate direction/role classification like rwb's
 * `direction_role_title`) — never via shortDescription/tags, see
 * workers/getmatch.js's post-mortem on skills/description false positives.
 * Then routes each listing through the same enqueue-from-harvest pipeline
 * used by the other harvest workers (profile.yaml fit score + exclude_patterns,
 * dedup via lib/store.js, apply-route classification via
 * adapters/platforms/hosts.js — matches `team.tbank.ru`/`tinkoff.ru/career`
 * to `tbank_careers`, which has `allowAutoSubmit: true` in specs.js). dryRun
 * is always true here — this worker only harvests and classifies; live apply
 * stays gated behind apply-next/apply-dispatcher.
 *
 * Run: node cli.js tbank-harvest [limit]
 * Login: not required — public page, no WAF UA-blocking observed
 */
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

// cityId = Moscow FIAS id; page also works without it (falls back to geo-IP
// detected city) but Moscow gives the fullest IT catalog.
const LIST_URL = 'https://www.tbank.ru/career/vacancies/it/?cityId=0c5b2444-70a0-4932-980c-b4dc0d3f02b5';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FRONTEND_ROLE_RE = /frontend|front[- ]?end|фронтенд/i;

function decodeEntities(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

async function fetchListings() {
  const res = await fetch(LIST_URL, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${LIST_URL}`);
  const html = await res.text();

  const stateMatch = html.match(/<script id="__TRAMVAI_STATE__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!stateMatch) throw new Error('__TRAMVAI_STATE__ blob not found on page');

  // The vacancies array is reliably followed by the sibling "nextPagination"
  // key — cheaper and more robust here than a full-document JSON.parse
  // (unrelated parts of the state blob, e.g. legal-disclaimer text, contain
  // stray unescaped quotes that break a whole-document parse).
  const vacMatch = stateMatch[1].match(/"vacancies":(\[[\s\S]*?\]),"nextPagination"/);
  if (!vacMatch) throw new Error('vacancies array not found in __TRAMVAI_STATE__');

  return JSON.parse(decodeEntities(vacMatch[1]));
}

export async function runTbank({ limit = 20 } = {}) {
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const candidates = listings.filter((v) => FRONTEND_ROLE_RE.test(v.title ?? ''));

  console.log(`[tbank] ${listings.length} listings, ${candidates.length} frontend-relevant`);

  const results = [];
  for (const v of candidates.slice(0, limit)) {
    const url = `https://www.tbank.ru/career/it/vacancy/moscow/${v.seoSlug}/${v.urlSlug}/`;
    const rawText = `${v.title}\n${v.shortDescription ?? ''}\n${(v.tags ?? []).join(' · ')}`;

    const out = enqueueFromHarvestPost({
      sourceId: 'tbank',
      postId: v.urlSlug,
      postUrl: url,
      rawText,
      links: [url],
      dryRun: true,
      skipFitCheck: false,
    });

    const r = out.results[0];
    console.log(`[tbank] ${r.action}  ${v.title}`);
    results.push({ id: v.urlSlug, name: v.title, ...r });
  }

  const queued = results.filter((r) => r.action === 'would_apply').length;
  console.log(`[tbank] done: scanned=${listings.length} candidates=${candidates.length} would_apply=${queued}`);

  return { ok: true, scanned: listings.length, candidates: candidates.length, processed: results.length, results };
}
