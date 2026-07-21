/**
 * We Work Remotely — public RSS feed, harvest-only (no live auto-apply).
 *
 * Fetches the front-end-programming category RSS feed (already filtered to
 * frontend roles by WWR itself), then routes each listing through the same
 * enqueue-from-harvest pipeline used by Telegram/career-platform harvest
 * (profile.yaml fit score + exclude_patterns, dedup via lib/store.js,
 * apply-route classification via lib/router.js). dryRun is always true —
 * this worker only harvests and classifies; live apply stays gated behind
 * apply-next/apply-dispatcher.
 *
 * Run: node cli.js weworkremotely-harvest [limit]
 * Login: not required — public RSS feed
 */
import * as cheerio from 'cheerio';
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

const RSS_URL = 'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss';
const UA = 'apply-hub/1.0 (+https://github.com/apply-hub) job-search harvest bot';

function stripHtml(html) {
  return cheerio.load(html ?? '').text().replace(/\s+/g, ' ').trim();
}

function extractLinks(html) {
  const $ = cheerio.load(html ?? '');
  return [...new Set($('a[href]').map((_, el) => $(el).attr('href')).get())];
}

async function fetchListings() {
  const res = await fetch(RSS_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${RSS_URL}`);
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  return $('item').map((_, el) => {
    const $el = $(el);
    const descriptionHtml = $el.find('description').text();
    return {
      title: $el.find('title').text().trim(),
      url: $el.find('link').text().trim() || $el.find('guid').text().trim(),
      description: stripHtml(descriptionHtml),
      links: extractLinks(descriptionHtml),
    };
  }).get();
}

export async function runWeWorkRemotely({ limit = 20 } = {}) {
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  console.log(`[weworkremotely] ${listings.length} front-end listings`);

  const results = [];
  for (const job of listings.slice(0, limit)) {
    const rawText = `${job.title}\n${job.description}`;
    const links = [job.url, ...job.links].filter(Boolean);

    const out = enqueueFromHarvestPost({
      sourceId: 'weworkremotely',
      postId: job.url,
      postUrl: job.url,
      rawText,
      links,
      dryRun: true,
      skipFitCheck: false,
    });

    const r = out.results[0];
    console.log(`[weworkremotely] ${r.action}  ${job.title}`);
    results.push({ title: job.title, url: job.url, ...r });
  }

  const queued = results.filter((r) => r.action === 'would_apply').length;
  console.log(`[weworkremotely] done: scanned=${listings.length} would_apply=${queued}`);

  return { ok: true, scanned: listings.length, processed: results.length, results };
}
