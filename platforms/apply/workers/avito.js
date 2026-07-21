/**
 * Avito careers — public server-rendered vacancy listing, harvest-only (no live auto-apply here).
 *
 * career.avito.com is a Bitrix CMS site with no discoverable JSON API (checked
 * page source, robots.txt/sitemap, and the shared JS bundle for fetch/ajax
 * calls — filter checkboxes submit as plain GET query params, full page
 * reload). The "Разработка" (development) category page instead ships every
 * vacancy as plain server-rendered HTML with structured data-* attributes per
 * card, so we scrape that page with cheerio and filter by the title field
 * (not free-text description/skills — see workers/getmatch.js's post-mortem
 * on skills-based false positives), then route each listing through the same
 * enqueue-from-harvest pipeline used by Telegram/career-platform harvest
 * (profile.yaml fit score + exclude_patterns, dedup via lib/store.js,
 * apply-route classification via adapters/platforms/hosts.js — matches
 * `career.avito.com` to `avito_careers`, which has `allowAutoSubmit: true` in
 * specs.js). dryRun is always true here — this worker only harvests and
 * classifies; live apply stays gated behind apply-next/apply-dispatcher.
 *
 * Run: node cli.js avito-harvest [limit]
 * Login: not required — public page
 */
import * as cheerio from 'cheerio';
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

const LIST_URL = 'https://career.avito.com/vacancies/razrabotka/';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const FRONTEND_ROLE_RE = /frontend|front[- ]?end/i;

async function fetchListings() {
  const res = await fetch(LIST_URL, {
    headers: { 'User-Agent': UA, Referer: 'https://career.avito.com/vacancies/', Accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${LIST_URL}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  return $('.vacancies-section__item').map((_, el) => {
    const $item = $(el);
    const $link = $item.find('.vacancies-section__item-name');
    const href = $link.attr('href');
    return {
      id: $item.attr('data-vacancy-id'),
      title: $link.text().trim(),
      url: href ? new URL(href, LIST_URL).toString() : null,
      geo: $item.attr('data-vacancy-geo') ?? '',
      team: $item.attr('data-vacancy-team') ?? '',
      remote: $item.attr('data-vacancy-remote') === 'Да',
    };
  }).get().filter((v) => v.id && v.url);
}

export async function runAvito({ limit = 20 } = {}) {
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const candidates = listings.filter((v) => FRONTEND_ROLE_RE.test(v.title));

  console.log(`[avito] ${listings.length} listings, ${candidates.length} frontend-relevant`);

  const results = [];
  for (const v of candidates.slice(0, limit)) {
    const rawText = `${v.title}\n${v.geo}${v.team ? ` · ${v.team}` : ''}${v.remote ? ' · Удалёнка' : ''}`;

    const out = enqueueFromHarvestPost({
      sourceId: 'avito',
      postId: v.id,
      postUrl: v.url,
      rawText,
      links: [v.url],
      dryRun: true,
      skipFitCheck: false,
    });

    const r = out.results[0];
    console.log(`[avito] ${r.action}  ${v.title}`);
    results.push({ id: v.id, title: v.title, ...r });
  }

  const queued = results.filter((r) => r.action === 'would_apply').length;
  console.log(`[avito] done: scanned=${listings.length} candidates=${candidates.length} would_apply=${queued}`);

  return { ok: true, scanned: listings.length, candidates: candidates.length, processed: results.length, results };
}
