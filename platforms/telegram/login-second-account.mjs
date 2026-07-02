/**
 * Авторизация второго Telegram аккаунта через QR.
 * Run: node platforms/telegram/login-second-account.mjs
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RVC_DIR = join(__dirname, '..', 'rvc');
const SESSION_FILE = join(__dirname, '.telegram_session_work');

const creds = readFileSync(join(RVC_DIR, 'credentials.env'), 'utf8');
const API_ID = Number(creds.match(/TELEGRAM_API_ID=(\d+)/)?.[1]);
const API_HASH = creds.match(/TELEGRAM_API_HASH=(\w+)/)?.[1];
const PROXY_URL = creds.match(/TELEGRAM_PROXY_URL=(\S+)/)?.[1]?.trim();

const { TelegramClient } = await import(join(RVC_DIR, 'node_modules', 'telegram', 'index.js'));
const { StringSession } = await import(join(RVC_DIR, 'node_modules', 'telegram', 'sessions', 'index.js'));
const { default: qr } = await import(join(__dirname, 'node_modules', 'qrcode-terminal', 'lib', 'main.js'));

let proxy;
if (PROXY_URL) {
  const u = new URL(PROXY_URL);
  proxy = { socksType: 5, ip: u.hostname, port: Number(u.port), timeout: 10 };
}

const client = new TelegramClient(new StringSession(''), API_ID, API_HASH, {
  connectionRetries: 5, useWSS: false, proxy,
});

await client.connect();

console.log('📱 Telegram → Настройки → Устройства → Подключить устройство\n');

await client.signInUserWithQrCode(
  { apiId: API_ID, apiHash: API_HASH },
  {
    qrCode: async (code) => {
      const token = Buffer.from(code.token).toString('base64url');
      const url = `tg://login?token=${token}`;
      console.clear();
      console.log('📱 Telegram → Настройки → Устройства → Подключить устройство\n');
      qr.generate(url, { small: true });
      console.log('\n' + url + '\n');
    },
    password: async () => {
      // 2FA — спросим если надо
      process.stdout.write('Пароль 2FA: ');
      const pw = await new Promise(res => {
        const chunks = [];
        process.stdin.once('data', d => res(d.toString().trim()));
      });
      return pw;
    },
    onError: async (err) => {
      console.error('Ошибка:', err.message);
      return true; // retry
    },
  }
);

const me = await client.getMe();
const sessionStr = client.session.save();
writeFileSync(SESSION_FILE, sessionStr, 'utf8');

console.log(`\n✅ Залогинились: ${me.firstName} ${me.lastName ?? ''} (@${me.username ?? me.phone})`);
console.log(`✅ Сессия → ${SESSION_FILE}`);

await client.disconnect();
process.exit(0);
