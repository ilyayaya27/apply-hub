/**
 * GetMatch worker — 5-step wizard apply for frontend vacancies.
 *
 * Flow:
 *  1. Scrape vacancy list from getmatch.ru/vacancies?spec=frontend
 *  2. For each vacancy: open, run 5-step modal wizard
 *     Step 1: Format    → "Полная удалёнка"
 *     Step 2: Specialty → "JavaScript / TypeScript"
 *     Step 3: Salary    → salary_200_plus
 *     Step 4: skipped   — requires GetMatch session (login-once.js getmatch)
 *  3. Track applied in data/getmatch-state.json
 *
 * Login-once: node platforms/apply/login-once.js getmatch
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadSessionState } from '../lib/session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_PATH = join(DATA_DIR, 'getmatch-state.json');

const DRY_RUN = process.env.APPLY_DRY_RUN === '1' || process.env.DRY_RUN === '1';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function loadState() {
  if (!existsSync(STATE_PATH)) return { applied: {} };
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { return { applied: {} }; }
}

function saveState(state) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function scrapeVacancies(page, limit = 20) {
  await page.goto('https://getmatch.ru/vacancies?spec=frontend&remote=true', {
    waitUntil: 'networkidle', timeout: 30_000,
  });
  await page.waitForTimeout(4000);
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/vacancies/"]')]
      .map(a => a.href.split('?')[0])
      .filter(h => /\/vacancies\/\d/.test(h))
      .filter((v, i, arr) => arr.indexOf(v) === i)
  );
  return links.slice(0, limit);
}

async function applyWizard(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForTimeout(3000);

  const applyBtn = page.locator('button:has-text("Откликнуться")').first();
  if (!(await applyBtn.isVisible().catch(() => false))) {
    return { ok: false, status: 'no_apply_button' };
  }

  await applyBtn.click();
  await page.waitForTimeout(2000);

  const modalVisible = await page.locator('.b-apply-modal').isVisible().catch(() => false);
  if (!modalVisible) return { ok: false, status: 'no_modal' };

  // Step 1: format — prefer remote
  const formatCards = page.locator('.b-apply-modal__choice-card');
  const formatCount = await formatCards.count();
  if (formatCount > 0) {
    let clicked = false;
    for (let i = 0; i < formatCount; i++) {
      const text = await formatCards.nth(i).innerText();
      if (/удалён/i.test(text)) { await formatCards.nth(i).click(); clicked = true; break; }
    }
    if (!clicked) await formatCards.first().click();
    await page.waitForTimeout(400);
    await page.locator('.b-apply-modal button.g-btn-primary').click();
    await page.waitForTimeout(1500);
  }

  // Step 2: specialization — click JS/TS tag
  const jsTags = page.locator('.b-apply-modal .tag_tagComponent___q5kb');
  const tagCount = await jsTags.count();
  if (tagCount > 0) {
    let clicked = false;
    for (let i = 0; i < tagCount; i++) {
      const text = await jsTags.nth(i).innerText();
      if (/javascript|typescript|frontend/i.test(text)) {
        await jsTags.nth(i).click(); clicked = true; break;
      }
    }
    if (!clicked) await jsTags.first().click();
    await page.waitForTimeout(400);
    await page.locator('.b-apply-modal button.g-btn-primary').click();
    await page.waitForTimeout(1500);
  }

  // Step 3: salary — 200k+
  const salaryRadio = page.locator('input[value="salary_200_plus"]');
  if (await salaryRadio.count() > 0) {
    await page.evaluate(() => {
      const r = document.querySelector('input[value="salary_200_plus"]');
      if (r) r.click();
    });
    await page.waitForTimeout(400);
    await page.locator('.b-apply-modal button.g-btn-primary').click();
    await page.waitForTimeout(1500);
  }

  // Step 4: email — only if not already logged in (session skips this)
  const emailInput = page.locator('#apply-login');
  if (await emailInput.isVisible().catch(() => false)) {
    // If we see email step with session, something is wrong — needs login
    return { ok: false, status: 'needs_login', note: 'run: node login-once.js getmatch' };
  }

  // Step 5+: name / telegram if shown
  const nameInput = page.locator('.b-apply-modal input[placeholder*="мя"], .b-apply-modal input[name*="name"]');
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('Илья Зуев');
    await page.waitForTimeout(300);
    await page.locator('.b-apply-modal button.g-btn-primary').click();
    await page.waitForTimeout(1500);
  }

  // Check for success
  const success = await page.evaluate(() => {
    const m = document.querySelector('.b-apply-modal');
    return m ? m.innerText : '';
  });

  if (/успешно|отклик.*отправ|спасиб/i.test(success)) {
    return { ok: true, status: 'applied' };
  }

  // Modal gone = likely submitted
  const modalGone = !(await page.locator('.b-apply-modal').isVisible().catch(() => false));
  if (modalGone) return { ok: true, status: 'applied' };

  return { ok: false, status: 'incomplete', note: success.slice(0, 100) };
}

export async function runGetmatch({ limit = 10 } = {}) {
  const session = loadSessionState('getmatch');
  if (!session) {
    console.warn('[getmatch] No session — run: node platforms/apply/login-once.js getmatch');
  }

  const state = loadState();
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: 'ru-RU',
    ...(session ? { storageState: session } : {}),
  });
  const page = await ctx.newPage();

  console.log('[getmatch] Scraping frontend vacancies...');
  const urls = await scrapeVacancies(page, limit * 3);
  console.log(`[getmatch] Found ${urls.length} vacancies`);

  const results = [];
  let processed = 0;

  for (const url of urls) {
    if (processed >= limit) break;
    const key = url.replace(/.*\/vacancies\//, '');

    if (state.applied[key]) {
      console.log(`[getmatch] skip (applied) ${key}`);
      results.push({ url, status: 'already_applied', skipped: true });
      continue;
    }

    processed++;
    console.log(`[getmatch] applying → ${url}`);

    if (DRY_RUN) {
      results.push({ url, status: 'dry_run', ok: false });
      continue;
    }

    try {
      const result = await applyWizard(page, url);
      results.push({ url, ...result });
      if (result.ok) {
        state.applied[key] = { appliedAt: new Date().toISOString(), status: 'applied', url };
        saveState(state);
        console.log(`[getmatch] ✅ applied  ${key}`);
      } else {
        console.log(`[getmatch] ❌ ${result.status}  ${key}  ${result.note ?? ''}`);
        if (result.status === 'needs_login') break;
      }
    } catch (e) {
      console.error(`[getmatch] error ${key}:`, e.message.slice(0, 80));
      results.push({ url, status: 'error', error: e.message.slice(0, 80) });
    }

    await page.waitForTimeout(3000 + Math.random() * 2000);
  }

  await browser.close();

  const summary = {
    ok: true,
    total: urls.length,
    processed,
    applied: results.filter(r => r.ok).length,
    results,
  };
  console.log('[getmatch] done:', JSON.stringify({ processed, applied: summary.applied }));
  return summary;
}
