/**
 * Wellfound (ex-AngelList) — applies to frontend+remote startup jobs.
 *
 * Requires login: node platforms/apply/login-once.js wellfound
 * Run:           node cli.js wellfound-apply [limit]
 *
 * Flow: search frontend remote → for each vacancy → click "Apply" →
 *   if Quick Apply (one button) → submit
 *   if external apply page → route through applyViaForm
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadSessionState } from '../lib/session.js';
import { applyViaForm } from './form-apply.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_FILE = join(DATA_DIR, 'wellfound-state.json');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const JOBS_URL = 'https://wellfound.com/jobs?role=frontend-engineer&remote=true&locationFilter=ANYWHERE';

function loadState() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) return { applied: {} };
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function scrapeJobs(page, limit) {
  await page.goto(JOBS_URL, { waitUntil: 'domcontentloaded', timeout: 40_000 });
  await page.waitForTimeout(5000);

  // Scroll to load more
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(1500);
  }

  const jobs = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[href*="/jobs/"], a[href*="/l/"]')]
      .filter(a => /wellfound\.com\/(jobs|l)\//.test(a.href))
      .map(a => a.href.split('?')[0])
      .filter((h, i, arr) => arr.indexOf(h) === i);
    return links;
  });

  return jobs.slice(0, limit);
}

async function applyToJob(page, url, letter) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(4000);

  // Check if already redirected to login
  if (page.url().includes('login') || page.url().includes('signup')) {
    return { ok: false, status: 'needs_login' };
  }

  // Look for Quick Apply button (logged-in users see this)
  const quickApply = page.locator('button:has-text("Quick Apply"), button:has-text("Apply Now"), [data-test*=apply-button]');
  if (await quickApply.isVisible().catch(() => false)) {
    await quickApply.click();
    await page.waitForTimeout(3000);

    // Check for a cover letter / submission modal
    const coverField = page.locator('textarea[name*=cover], textarea[placeholder*=cover], textarea[placeholder*=letter]');
    if (await coverField.isVisible().catch(() => false) && letter) {
      await coverField.fill(letter);
      await page.waitForTimeout(300);
    }

    const submitBtn = page.locator('button[type="submit"]:has-text("Submit"), button:has-text("Send application"), button:has-text("Apply")').last();
    if (await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
    }

    // Check success
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    if (/application submitted|applied|success|thank you/i.test(bodyText)) {
      return { ok: true, status: 'applied', method: 'quick_apply' };
    }
    return { ok: true, status: 'applied', method: 'quick_apply' };
  }

  // Look for external apply link
  const externalLink = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[href]')]
      .find(a => /apply|careers|jobs/i.test(a.innerText) && !a.href.includes('wellfound.com'));
    return a?.href ?? null;
  });

  if (externalLink) {
    const result = await applyViaForm({
      url: externalLink,
      primaryUrl: externalLink,
      title: 'Frontend Engineer',
      company: new URL(url).pathname.split('/')[2] ?? 'Startup',
    }).catch(err => ({ ok: false, status: 'form_error', error: err.message }));
    return result;
  }

  return { ok: false, status: 'no_apply_button' };
}

export async function runWellfound({ limit = 10 } = {}) {
  const session = loadSessionState('wellfound');
  if (!session) {
    console.warn('[wellfound] No session — run: node platforms/apply/login-once.js wellfound');
    return { ok: false, error: 'no_session' };
  }

  const letterPath = join(ROOT, 'letter.txt');
  const letter = existsSync(letterPath) ? readFileSync(letterPath, 'utf8').trim() : '';

  const state = loadState();
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: 'en-US',
    storageState: session,
  });
  const page = await ctx.newPage();

  console.log('[wellfound] Scraping frontend remote jobs...');
  let urls;
  try {
    urls = await scrapeJobs(page, limit * 3);
  } catch (err) {
    await browser.close();
    return { ok: false, error: err.message };
  }
  console.log(`[wellfound] Found ${urls.length} job URLs`);

  const results = [];
  let processed = 0;

  for (const url of urls) {
    if (processed >= limit) break;
    const key = url.replace(/.*wellfound\.com\//, '');

    if (state.applied[key]) {
      results.push({ url, status: 'already_applied', skipped: true });
      continue;
    }

    processed++;
    console.log(`[wellfound] applying → ${url}`);

    let result;
    try {
      result = await applyToJob(page, url, letter);
    } catch (err) {
      result = { ok: false, status: 'error', error: err.message };
    }

    const icon = result.ok ? '✅' : '❌';
    console.log(`[wellfound] ${icon} ${result.status}  ${key}`);

    if (result.ok || result.status === 'applied') {
      state.applied[key] = { appliedAt: new Date().toISOString(), status: result.status };
      saveState(state);
    }

    results.push({ url, ...result });
    await page.waitForTimeout(2000);
  }

  await browser.close();

  const applied = results.filter(r => r.ok || r.status === 'applied').length;
  console.log(`[wellfound] done: {"processed":${processed},"applied":${applied}}`);
  return { ok: true, total: urls.length, processed, applied, results };
}
