#!/usr/bin/env node
/**
 * Авторизация на app.rvc.global через Telegram Login Widget.
 *
 * Алгоритм:
 *  1. Playwright открывает /auth/sign-in, кликает виджет "Войти через Telegram"
 *  2. GramJS ловит auth-запрос от @job_match_robot и подтверждает его
 *  3. Playwright ждёт редиректа на /candidate → сохраняет storageState
 *
 * Usage: node platforms/apply/login-rvc.js
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = join(ROOT, 'sessions');
const SESSION_PATH = join(SESSIONS_DIR, 'rvc_global.json');
const TG_SESSION_FILE = join(ROOT, '..', 'telegram', '.telegram_session');
const TG_ENV_FILE = join(ROOT, '..', 'telegram', '.env');

// --- load TG credentials from platforms/telegram/.env ---
const loadEnv = (path) => {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
};

const tgEnv = loadEnv(TG_ENV_FILE);
const TG_API_ID = Number(tgEnv.TELEGRAM_API_ID);
const TG_API_HASH = tgEnv.TELEGRAM_API_HASH;
const TG_PROXY_URL = tgEnv.TELEGRAM_PROXY_URL;
const TG_SESSION = existsSync(TG_SESSION_FILE) ? readFileSync(TG_SESSION_FILE, 'utf8').trim() : '';

if (!TG_API_ID || !TG_API_HASH || !TG_SESSION) {
  console.error('[login-rvc] Не найдены TG credentials. Проверь platforms/telegram/.env и .telegram_session');
  process.exit(1);
}

mkdirSync(SESSIONS_DIR, { recursive: true });

// --- connect GramJS ---
async function connectGramJs() {
  const { TelegramClient } = await import('telegram');
  const { StringSession } = await import('telegram/sessions/index.js');

  let proxy;
  if (TG_PROXY_URL) {
    const u = new URL(TG_PROXY_URL);
    proxy = { socksType: 5, ip: u.hostname, port: Number(u.port), timeout: 10 };
  }

  const client = new TelegramClient(
    new StringSession(TG_SESSION),
    TG_API_ID,
    TG_API_HASH,
    { connectionRetries: 5, autoReconnect: true, ...(proxy ? { proxy } : {}) }
  );
  await client.connect();
  console.log('[login-rvc] GramJS подключён');
  return client;
}

// --- wait for auth confirm message from job_match_robot and click Accept ---
async function waitAndConfirmTgAuth(client, timeoutMs = 120_000) {
  console.log('[login-rvc] Жду сообщение от @job_match_robot...');
  const { Api } = await import('telegram');

  const deadline = Date.now() + timeoutMs;
  let lastMsgId = 0;

  // get current last message id from bot to skip old ones
  try {
    const hist = await client.invoke(new Api.messages.GetHistory({
      peer: 'job_match_robot',
      limit: 1,
      offsetId: 0, addOffset: 0, maxId: 0, minId: 0, hash: BigInt(0),
    }));
    lastMsgId = hist.messages?.[0]?.id ?? 0;
  } catch { /* bot may have no history yet */ }

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const hist = await client.invoke(new Api.messages.GetHistory({
        peer: 'job_match_robot',
        limit: 5,
        offsetId: 0, addOffset: 0, maxId: 0, minId: 0, hash: BigInt(0),
      }));

      for (const msg of hist.messages ?? []) {
        if (msg.id <= lastMsgId) continue;
        const text = msg.message ?? '';
        // look for auth confirmation button (KeyboardButtonCallback)
        const rows = msg.replyMarkup?.rows ?? [];
        for (const row of rows) {
          for (const btn of row.buttons ?? []) {
            if (btn.className === 'KeyboardButtonCallback') {
              const label = btn.text?.toLowerCase() ?? '';
              if (label.includes('подтвердить') || label.includes('confirm') || label.includes('accept') || label.includes('войти') || label.includes('allow')) {
                console.log(`[login-rvc] Нажимаю кнопку "${btn.text}" в сообщении от @job_match_robot`);
                await client.invoke(new Api.messages.GetBotCallbackAnswer({
                  peer: 'job_match_robot',
                  msgId: msg.id,
                  data: btn.data,
                }));
                return true;
              }
            }
          }
        }
        // also check for inline keyboard on service message
        if (text.includes('rvc') || text.includes('RVC') || text.includes('авторизац') || text.includes('login')) {
          console.log(`[login-rvc] Найдено сообщение авторизации: "${text.slice(0, 80)}"`);
        }
        lastMsgId = Math.max(lastMsgId, msg.id);
      }
    } catch (e) {
      console.warn('[login-rvc] GramJS poll error:', e.message);
    }
  }
  return false;
}

// --- main ---
const client = await connectGramJs();

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-blink-features=AutomationControlled'],
});
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'ru-RU',
});
const page = await context.newPage();

console.log('[login-rvc] Открываю app.rvc.global/auth/sign-in...');
await page.goto('https://app.rvc.global/auth/sign-in', { waitUntil: 'domcontentloaded', timeout: 30_000 });

// Find and click Telegram login button
const tgBtn = page.locator('button:has-text("Telegram"), a:has-text("Telegram"), [class*="telegram"], [class*="tg-login"]').first();
await tgBtn.waitFor({ timeout: 15_000 });
console.log('[login-rvc] Кликаю кнопку Telegram login...');

// Intercept the oauth popup
const [popup] = await Promise.all([
  context.waitForEvent('page', { timeout: 10_000 }).catch(() => null),
  tgBtn.click(),
]);

if (popup) {
  console.log('[login-rvc] Popup URL:', popup.url());
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
}

// Now wait for GramJS to confirm the auth
const confirmed = await waitAndConfirmTgAuth(client, 90_000);

if (!confirmed) {
  console.error('[login-rvc] Не получили подтверждение от @job_match_robot за 90 сек');
  console.log('[login-rvc] Попробуй подтвердить вручную в Telegram, жду редиректа на /candidate...');
}

// Wait for redirect to /candidate after auth
try {
  await page.waitForURL('**/candidate**', { timeout: 60_000 });
  console.log('[login-rvc] Залогинились! URL:', page.url());
} catch {
  console.error('[login-rvc] Редирект на /candidate не произошёл. Текущий URL:', page.url());
  await browser.close();
  await client.disconnect();
  process.exit(1);
}

await context.storageState({ path: SESSION_PATH });
await browser.close();
await client.disconnect();

console.log(`[login-rvc] Сессия сохранена: ${SESSION_PATH}`);
