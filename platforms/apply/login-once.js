#!/usr/bin/env node
/**
 * Сохраняет Playwright-сессию для платформы с логином.
 * Запустить один раз вручную, войти в браузере — сессия сохранится.
 *
 * Usage: node platforms/apply/login-once.js <platform_id>
 * Supported: djinni, habr_career
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = join(ROOT, 'sessions');

const LOGIN_URLS = {
  djinni: 'https://djinni.co/login',
  habr_career: 'https://career.habr.com/users/sign_in',
  yandex_careers: 'https://passport.yandex.ru/auth',
  // GetMatch: кандидат логинится через vizard — открываем вакансию и ждём завершения
  getmatch: 'https://getmatch.ru/vacancies/34858-kh5-media-nanimaet-postroim-reklamnuiu-platformu',
};

const LOGIN_DONE_SELECTORS = {
  djinni: 'a[href="/my/inbox/"], .navbar-user, [data-name="user-menu"], .bi-person-circle',
  habr_career: '.profile-avatar, .account__username, [data-user]',
  yandex_careers: '.user-account, [data-bem*="user"], .home-arrow__user, .UserAvatar',
  // GetMatch: после подтверждения email модалка исчезает
  getmatch: 'body:not(:has(.b-apply-modal))',
};

const platformId = process.argv[2];
if (!platformId || !LOGIN_URLS[platformId]) {
  console.error('Usage: node login-once.js <platform_id>');
  console.error(`Supported: ${Object.keys(LOGIN_URLS).join(', ')}`);
  process.exit(1);
}

console.log(`[login-once] Открываю ${platformId} — войдите вручную в браузере.`);
console.log(`[login-once] Ожидаю подтверждения входа (макс. 3 мин)...`);

mkdirSync(SESSIONS_DIR, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  locale: 'ru-RU',
  userAgent:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();
await page.goto(LOGIN_URLS[platformId]);

if (platformId === 'yandex_careers') {
  console.log('[login-once] После входа откроется yandex.ru/jobs — дождитесь загрузки...');
}

// GetMatch: автоматически проходим шаги 1-3, потом ждём email + код от пользователя
if (platformId === 'getmatch') {
  console.log('[login-once] Открываю GetMatch вакансию — нажимаю Откликнуться...');
  await page.waitForTimeout(4000);
  await page.click('button:has-text("Откликнуться")').catch(() => {});
  await page.waitForTimeout(2000);
  // Step 1: format
  const cards = page.locator('.b-apply-modal__choice-card');
  if (await cards.count() > 0) {
    for (let i = 0; i < await cards.count(); i++) {
      if (/удалён/i.test(await cards.nth(i).innerText())) { await cards.nth(i).click(); break; }
    }
    await page.locator('.b-apply-modal button.g-btn-primary').click();
    await page.waitForTimeout(1500);
  }
  // Step 2: specialty
  const tags = page.locator('.b-apply-modal .tag_tagComponent___q5kb');
  if (await tags.count() > 0) {
    for (let i = 0; i < await tags.count(); i++) {
      if (/javascript/i.test(await tags.nth(i).innerText())) { await tags.nth(i).click(); break; }
    }
    await page.locator('.b-apply-modal button.g-btn-primary').click();
    await page.waitForTimeout(1500);
  }
  // Step 3: salary
  await page.evaluate(() => { const r = document.querySelector('input[value="salary_200_plus"]'); if (r) r.click(); });
  await page.waitForTimeout(400);
  await page.locator('.b-apply-modal button.g-btn-primary').click().catch(() => {});
  await page.waitForTimeout(1500);
  console.log('[login-once] Шаги 1-3 пройдены. Введите email в браузере и подтвердите код из письма.');
}

try {
  if (platformId === 'yandex_careers') {
    // Яндекс редиректит на id.yandex.ru после логина — детектируем по URL или аватару
    await Promise.race([
      page.waitForSelector(LOGIN_DONE_SELECTORS[platformId], { timeout: 180_000 }),
      page.waitForURL(/id\.yandex\.ru/, { timeout: 180_000 }),
    ]);
  } else {
    await page.waitForSelector(LOGIN_DONE_SELECTORS[platformId], { timeout: 180_000 });
  }
} catch {
  console.error('[login-once] Тайм-аут — вход не обнаружен. Попробуйте ещё раз.');
  await browser.close();
  process.exit(1);
}

// Для Яндекса сохраняем сессию уже находясь на jobs.yandex.ru
if (platformId === 'yandex_careers') {
  console.log('[login-once] Переход на yandex.ru/jobs для сохранения jobs-куков...');
  await page.goto('https://yandex.ru/jobs', { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);
}

const sessionPath = join(SESSIONS_DIR, `${platformId}.json`);
await context.storageState({ path: sessionPath });
await browser.close();

console.log(`[login-once] Сессия сохранена: ${sessionPath}`);
