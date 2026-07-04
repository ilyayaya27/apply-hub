/**
 * Общий помощник для отправки уведомлений в Telegram через GramJS-сессию
 * первого аккаунта. Используется inbox-check, watchdog, daily-digest и др.
 *
 * Не требует бота от BotFather — шлём себе в «Избранное» (peer 'me')
 * через уже существующую user-сессию (.telegram_session).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RVC_DIR = join(__dirname, '..', '..', '..', 'platforms', 'rvc');
const MAIN_SESSION = join(__dirname, '..', '..', '..', 'platforms', 'telegram', '.telegram_session');

/**
 * Строит подключённый GramJS-клиент из RVC-кредов.
 * @param {{ sessionFile?: string }} [opts]
 */
export async function buildTelegramClient({ sessionFile = MAIN_SESSION } = {}) {
  const credsPath = join(RVC_DIR, 'credentials.env');
  if (!existsSync(credsPath)) throw new Error(`credentials.env не найден: ${credsPath}`);
  if (!existsSync(sessionFile)) throw new Error(`TG-сессия не найдена: ${sessionFile}`);

  const creds = readFileSync(credsPath, 'utf8');
  const apiId = Number(creds.match(/TELEGRAM_API_ID=(\d+)/)?.[1]);
  const apiHash = creds.match(/TELEGRAM_API_HASH=(\w+)/)?.[1];
  const proxyUrl = creds.match(/TELEGRAM_PROXY_URL=(\S+)/)?.[1]?.trim();

  const { TelegramClient } = await import(join(RVC_DIR, 'node_modules', 'telegram', 'index.js'));
  const { StringSession } = await import(join(RVC_DIR, 'node_modules', 'telegram', 'sessions', 'index.js'));

  let proxy;
  if (proxyUrl) {
    const u = new URL(proxyUrl);
    proxy = { socksType: 5, ip: u.hostname, port: Number(u.port), timeout: 10 };
  }

  const client = new TelegramClient(
    new StringSession(readFileSync(sessionFile, 'utf8').trim()),
    apiId,
    apiHash,
    { connectionRetries: 3, useWSS: false, proxy },
  );
  await client.connect();
  return client;
}

/**
 * Шлёт текст в «Избранное» (Saved Messages) первого аккаунта.
 * @param {string} text
 * @param {{ dryRun?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export async function sendToSavedMessages(text, { dryRun = false } = {}) {
  if (dryRun) {
    console.log(`[tg-notify] [dry-run] → Избранное:\n${text}`);
    return true;
  }
  if (!config.tgSelfNotify) {
    // Самоуведомления выключены (TG_SELF_NOTIFY=0) — только в лог.
    console.log(`[tg-notify:muted]\n${text}`);
    return true;
  }
  const client = await buildTelegramClient();
  try {
    await client.sendMessage('me', { message: text });
    return true;
  } finally {
    await client.disconnect().catch(() => {});
  }
}
