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
  getmatch: 'https://getmatch.ru/login',
};

const LOGIN_DONE_SELECTORS = {
  djinni: 'a[href="/my/inbox/"], .navbar-user, [data-name="user-menu"], .bi-person-circle',
  habr_career: '.profile-avatar, .account__username, [data-user]',
  yandex_careers: '.user-account, [data-bem*="user"], .home-arrow__user, .UserAvatar',
  getmatch: 'a[href*="/profile"], [class*="header_user"], [class*="userMenu"], .b-header__user',
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

// Для Яндекса: после входа через паспорт нужно перейти на jobs чтобы сохранить сессию с jobs-куками
if (platformId === 'yandex_careers') {
  console.log('[login-once] После входа откроется yandex.ru/jobs — дождитесь загрузки...');
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
