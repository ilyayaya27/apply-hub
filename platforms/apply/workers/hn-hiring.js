/**
 * HackerNews "Who is Hiring?" — scrapes monthly thread, applies to frontend+remote startups.
 *
 * Applies via email when a contact email is found in the comment,
 * or via career form when a company URL is found.
 *
 * Run: node cli.js hn-apply [limit]
 * Login: not required — HN API is public
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyViaEmail } from './email-apply.js';
import { applyViaForm } from './form-apply.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_FILE = join(DATA_DIR, 'hn-hiring-state.json');
const HN_BASE = 'https://hacker-news.firebaseio.com/v0';

const FRONTEND_RE = /\b(?:frontend|front.end|react|next\.js|typescript|vue\.?js|javascript|svelte)\b/i;
const REMOTE_RE = /\b(?:remote|REMOTE|fully.remote|distributed)\b/;
const EMAIL_RE = /\b([\w.+\-]+@[\w.\-]+\.[a-z]{2,})\b/i;
// Common non-apply emails to skip
const IGNORE_EMAIL_RE = /@example\.|noreply|no-reply|postmaster|abuse@|support@/i;

function loadState() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) return { applied: {}, lastThreadId: null };
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'apply-hub/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function getHiringThreadIds(count = 2) {
  const ids = await fetchJson(`${HN_BASE}/user/whoishiring/submitted.json`);
  const threads = [];
  for (const id of ids.slice(0, 8)) {
    const item = await fetchJson(`${HN_BASE}/item/${id}.json`);
    if (/who is hiring/i.test(item.title ?? '')) {
      threads.push({ id, title: item.title });
      if (threads.length >= count) break;
    }
  }
  return threads;
}

function decodeHtml(text) {
  return text
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'")
    .replace(/&#x60;/g, '`')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function parseComment(item) {
  if (!item || item.deleted || item.dead || !item.text) return null;
  const raw = decodeHtml(item.text);
  const plain = raw.replace(/<a[^>]+href="([^"]+)"[^>]*>/gi, ' $1 ').replace(/<[^>]+>/g, ' ');

  if (!FRONTEND_RE.test(plain)) return null;
  if (!REMOTE_RE.test(plain)) return null;

  // Extract company name from first line (typical: "Company | Role | Location | ...")
  const firstLine = plain.split('\n')[0].trim();
  const parts = firstLine.split(/\s*\|\s*/);
  const company = parts[0].trim().slice(0, 60) || 'Unknown';
  // Role is the first non-URL, non-location-looking part
  const role = parts.slice(1).find(p => !/^https?:|^\s*(REMOTE|ON.?SITE|Full.?time|Part.?time|NYC|SF|Berlin|London|EU|US)\s*$/i.test(p.trim()))?.trim() || 'Frontend Developer';

  // Extract email (prefer jobs@, hiring@, founder@ over generic support@)
  const emails = [...plain.matchAll(/\b([\w.+\-]+@[\w.\-]+\.[a-z]{2,})\b/gi)]
    .map(m => m[1])
    .filter(e => !IGNORE_EMAIL_RE.test(e));
  const email = emails[0] ?? null;

  // Extract URLs (company site, apply link)
  const urls = [...plain.matchAll(/https?:\/\/[^\s<>"']+/g)]
    .map(m => m[0].replace(/[.,)]+$/, ''))
    .filter(u => !u.includes('news.ycombinator') && !u.includes('github.com/PrairieLearn') && u.length < 120);
  const applyUrl = urls.find(u => /apply|jobs|careers|work|hiring/i.test(u)) ?? urls[0] ?? null;

  return { company, role, email, applyUrl, hnId: item.id, text: plain.slice(0, 300) };
}

export async function runHnHiring({ limit = 20, dryRun = false } = {}) {
  const state = loadState();
  const threads = await getHiringThreadIds(2); // current + previous month
  if (!threads.length) return { ok: false, error: 'no_hiring_thread' };

  // Collect all comment IDs across both threads (current first)
  const allKids = [];
  for (const t of threads) {
    const thread = await fetchJson(`${HN_BASE}/item/${t.id}.json`);
    console.log(`[hn-hiring] Thread: "${thread.title}" — ${thread.kids?.length ?? 0} comments`);
    for (const kid of (thread.kids ?? [])) allKids.push(kid);
  }

  // Load English cover letter (HN hiring is international)
  const letterPath = existsSync(join(ROOT, 'letter_en.txt'))
    ? join(ROOT, 'letter_en.txt')
    : join(ROOT, 'letter.txt');
  const letter = readFileSync(letterPath, 'utf8').trim();

  const results = [];
  let processed = 0;

  for (const kid of allKids) {
    if (processed >= limit) break;

    const key = String(kid);
    if (state.applied[key]) {
      results.push({ hnId: kid, status: 'already_applied', skipped: true });
      continue;
    }

    let item;
    try { item = await fetchJson(`${HN_BASE}/item/${kid}.json`); }
    catch { continue; }

    const parsed = parseComment(item);
    if (!parsed) continue;

    processed++;
    console.log(`[hn-hiring] → ${parsed.company} | ${parsed.role}`);
    console.log(`             email: ${parsed.email ?? '-'}  url: ${parsed.applyUrl ?? '-'}`);

    let result;
    if (dryRun) {
      result = { ok: false, status: 'dry_run' };
    } else if (parsed.email) {
      result = await applyViaEmail({
        primaryUrl: parsed.email,
        title: parsed.role,
        company: parsed.company,
        letter,
      });
    } else if (parsed.applyUrl) {
      result = await applyViaForm({
        url: parsed.applyUrl,
        primaryUrl: parsed.applyUrl,
        title: parsed.role,
        company: parsed.company,
      }).catch(err => ({ ok: false, status: 'form_error', error: err.message }));
    } else {
      result = { ok: false, status: 'no_contact' };
    }

    const icon = result.ok || result.status === 'applied' ? '✅' : '⚠️ ';
    console.log(`[hn-hiring] ${icon} ${result.status}  ${parsed.company}`);

    if (result.ok || result.status === 'applied' || result.status === 'dry_run') {
      state.applied[key] = {
        appliedAt: new Date().toISOString(),
        company: parsed.company,
        method: parsed.email ? 'email' : 'form',
      };
      saveState(state);
    }

    results.push({ ...parsed, ...result });

    // Rate limit — be polite to HN API
    await new Promise(r => setTimeout(r, 300));
  }

  const applied = results.filter(r => r.ok || r.status === 'applied').length;
  const dryRuns = results.filter(r => r.status === 'dry_run').length;
  console.log(`[hn-hiring] done: processed=${processed} applied=${applied}${dryRun ? ` dry_run=${dryRuns}` : ''}`);

  return { ok: true, threads: threads.map(t => t.id), total: allKids.length, processed, applied, results };
}
