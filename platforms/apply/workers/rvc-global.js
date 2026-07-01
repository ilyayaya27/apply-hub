/**
 * rvc.global matched vacancies worker.
 *
 * Flow:
 *  1. GET /candidate/vacancies?status=MATCHED   → list of matched jobs
 *  2. Extract apply URL from description HTML
 *  3. Route via applyViaForm() → existing platform adapters
 *  4. Track applied state in data/rvc-global-state.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyViaForm } from './form-apply.js';
import { applyViaEmail } from './email-apply.js';
import { careerPlatformId } from '../adapters/platforms/hosts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_PATH = join(DATA_DIR, 'rvc-global-state.json');

const TOKEN = process.env.RVC_GLOBAL_TOKEN;
const API_BASE = process.env.RVC_GLOBAL_API ?? 'https://api.rvc.global';
const DRY_RUN = process.env.APPLY_DRY_RUN === '1' || process.env.DRY_RUN === '1';

const PROMO_PATTERNS = [
  /t\.me\/job_react/i, /t\.me\/JScript_jobs/i, /t\.me\/proglib_jobs/i,
  /vk\.com\/react_job/i, /vk\.com\/javascript_job/i, /max\.ru\//i,
];

/** Extract first apply URL from vacancy description HTML */
function extractApplyUrl(html) {
  if (!html) return null;

  // 1) "Откликнуться" / "Apply" explicit link
  const m = html.match(/href=["'](https?:\/\/[^"']+)["'][^>]*>?\s*(?:<\w+>)?\s*(?:Откликнуться|Apply)/i);
  if (m) return m[1].replace(/[?#\s]+$/, '');

  // 2) Any href matching a known career platform (skipping promo links)
  const allHrefs = [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)].map((x) => x[1]);
  for (const href of allHrefs) {
    if (PROMO_PATTERNS.some((p) => p.test(href))) continue;
    if (careerPlatformId(href)) return href.replace(/[?#\s]+$/, '');
  }

  return null;
}

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

/** Extract email from description text (href="mailto:..." or bare email) */
function extractApplyEmail(html) {
  if (!html) return null;
  // mailto: links first
  const mailto = html.match(/href=["']mailto:([^"'>\s]+)["']/i);
  if (mailto) return mailto[1].trim();
  // bare email near "резюме" / "отправь" / "письм" keywords
  const plain = html.replace(/<[^>]+>/g, ' ');
  const near = plain.match(/(?:резюме|отправ|письм|отклик|почт|email|e-mail|hr@|jobs@)[^.]*?([\w.+\-]+@[\w.\-]+\.[a-z]{2,})/i);
  if (near) return near[1].trim();
  return null;
}

/** Skip TG DMs (direct contacts, not known career platforms) */
function isSkippableUrl(url) {
  if (!url) return true;
  if (PROMO_PATTERNS.some((p) => p.test(url))) return true;
  // TG DMs that are not promo channels → also skip (needs_human)
  if (/^https?:\/\/t\.me\/[^/]+\/?$/.test(url) && !url.includes('job_')) return true;
  return false;
}

/** Load persisted state {applied: Record<string, {appliedAt, status}>} */
function loadState() {
  if (!existsSync(STATE_PATH)) return { applied: {} };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { applied: {} };
  }
}

/** Persist state */
function saveState(state) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/** Fetch matched vacancies from API */
async function fetchMatched() {
  const res = await fetch(`${API_BASE}/candidate/vacancies?status=MATCHED&page=0&size=100`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`rvc.global API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.recent ?? data.content ?? data ?? [];
}

/**
 * Apply to all matched rvc.global vacancies that have extractable URLs.
 * @param {{ dryRun?: boolean, limit?: number }} [opts]
 */
export async function applyRvcGlobal({ dryRun = DRY_RUN, limit = 50 } = {}) {
  if (!TOKEN) throw new Error('RVC_GLOBAL_TOKEN not set');

  const state = loadState();
  const vacancies = await fetchMatched();
  console.log(`[rvc-global] ${vacancies.length} matched vacancies from API`);

  const results = [];
  let processed = 0;

  for (const v of vacancies) {
    if (processed >= limit) break;

    const key = String(v.id ?? v.maskedId);
    const applyUrl = extractApplyUrl(v.description);

    const entry = {
      id: v.id,
      maskedId: v.maskedId,
      position: v.position,
      company: v.companyName,
      applyUrl,
      fetchedAt: new Date().toISOString(),
    };

    if (state.applied[key]) {
      console.log(`[rvc-global] skip (already applied) ${v.companyName} — ${v.position}`);
      results.push({ ...entry, status: 'already_applied', skipped: true });
      continue;
    }

    if (!applyUrl) {
      // Fallback: email in description
      const applyEmail = extractApplyEmail(v.description);
      if (applyEmail) {
        processed++;
        console.log(`[rvc-global] email         ${v.companyName} — ${v.position}  → ${applyEmail}`);
        const out = DRY_RUN
          ? { ok: false, status: 'dry_run', note: `would email ${applyEmail}` }
          : await applyViaEmail({ ...entry, title: v.position, primaryUrl: applyEmail });
        results.push({ ...entry, applyEmail, ...out });
        if (out.ok || out.status === 'applied') {
          state.applied[key] = { appliedAt: new Date().toISOString(), status: 'email', url: applyEmail };
          saveState(state);
        }
        continue;
      }
      console.log(`[rvc-global] no_apply_url  ${v.companyName} — ${v.position}`);
      results.push({ ...entry, status: 'no_apply_url', skipped: true });
      continue;
    }

    if (isSkippableUrl(applyUrl)) {
      console.log(`[rvc-global] tg/promo      ${v.companyName} — ${v.position}  ${applyUrl}`);
      results.push({ ...entry, status: 'needs_human', skipped: true });
      continue;
    }

    processed++;
    console.log(`[rvc-global] applying      ${v.companyName} — ${v.position}`);
    console.log(`             url: ${applyUrl}`);

    if (dryRun) {
      console.log(`             DRY_RUN — skipping submit`);
      results.push({ ...entry, status: 'dry_run' });
      continue;
    }

    try {
      const out = await applyViaForm({
        url: applyUrl,
        primaryUrl: applyUrl,
        title: v.position,
        company: v.companyName,
        source: 'rvc_global',
      });
      console.log(`             result: ${out.status ?? (out.ok ? 'ok' : 'failed')}`);
      results.push({ ...entry, ...out });

      if (out.status === 'applied') {
        // Actually submitted — mark as done
        state.applied[key] = { appliedAt: new Date().toISOString(), status: 'applied', url: applyUrl };
      } else if (out.status === 'fill_only') {
        // Filled but not submitted (allowAutoSubmit=false or FORM_SUBMIT=0)
        // Save so we don't endlessly re-fill, but mark separately from "applied"
        state.applied[key] = { appliedAt: new Date().toISOString(), status: 'fill_only', url: applyUrl };
      }
    } catch (err) {
      console.error(`[rvc-global] error on ${applyUrl}:`, err.message);
      results.push({ ...entry, status: 'error', error: err.message });
    }
  }

  saveState(state);
  return { ok: true, total: vacancies.length, processed, results };
}
