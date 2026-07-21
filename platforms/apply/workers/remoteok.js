/**
 * RemoteOK — public JSON API, harvest-only (no live auto-apply).
 *
 * Fetches https://remoteok.com/api, pre-filters for frontend/React/TS roles,
 * then routes each listing through the same enqueue-from-harvest pipeline
 * used by Telegram/career-platform harvest (profile.yaml fit score +
 * exclude_patterns, dedup via lib/store.js, apply-route classification via
 * lib/router.js). dryRun is always true here — this worker only harvests
 * and classifies; live apply stays gated behind apply-next/apply-dispatcher.
 *
 * Run: node cli.js remoteok-harvest [limit]
 * Login: not required — public API
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

const execFileAsync = promisify(execFile);

const API_URL = 'https://remoteok.com/api';
const UA = 'apply-hub/1.0 (+https://github.com/apply-hub) job-search harvest bot';
// Same keyword approach as workers/hn-hiring.js's FRONTEND_RE
const FRONTEND_RE = /\b(?:frontend|front.end|react|next\.js|typescript|vue\.?js|javascript|svelte)\b/i;

// ponytail: Node's fetch()/undici hangs reading this endpoint's body behind
// Cloudflare (repro'd with/without compression) — curl handles it fine, so
// shell out rather than debug undici internals for one job source.
async function fetchListings() {
  const { stdout } = await execFileAsync('curl', ['-s', '--max-time', '15', '-H', `User-Agent: ${UA}`, API_URL], {
    maxBuffer: 10 * 1024 * 1024,
  });
  const data = JSON.parse(stdout);
  // First element is a legal/metadata notice, not a listing.
  return data.filter((item) => item?.id && item?.position);
}

export async function runRemoteOk({ limit = 20 } = {}) {
  let listings;
  try {
    listings = await fetchListings();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const candidates = listings.filter((job) => {
    const text = `${job.position} ${(job.tags ?? []).join(' ')} ${job.description ?? ''}`;
    return FRONTEND_RE.test(text);
  });

  console.log(`[remoteok] ${listings.length} listings, ${candidates.length} frontend-relevant`);

  const results = [];
  for (const job of candidates.slice(0, limit)) {
    const rawText = `${job.position} at ${job.company}\n${(job.tags ?? []).join(', ')}\n${job.description ?? ''}`;
    const links = [job.url, job.apply_url].filter(Boolean);

    const out = enqueueFromHarvestPost({
      sourceId: 'remoteok',
      postId: String(job.id),
      postUrl: job.url,
      rawText,
      links,
      dryRun: true,
      skipFitCheck: false,
    });

    const r = out.results[0];
    console.log(`[remoteok] ${r.action}  ${job.company} — ${job.position}`);
    results.push({ id: job.id, company: job.company, position: job.position, ...r });
  }

  const queued = results.filter((r) => r.action === 'would_apply').length;
  console.log(`[remoteok] done: scanned=${listings.length} candidates=${candidates.length} would_apply=${queued}`);

  return { ok: true, scanned: listings.length, candidates: candidates.length, processed: results.length, results };
}
