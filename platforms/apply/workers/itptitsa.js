/**
 * IT-Птица "Контакты HR и Вакансии" worker.
 *
 * Reads the Telegram forum topic, for each new message:
 *   1. Extracts HH.ru/career links → enqueues via hh-worker or career pipeline
 *   2. Extracts @usernames of HR contacts → sends a brief DM (max 5/day)
 *   3. Reacts 👍 to the message
 *
 * Group: "IT-Птица. Поиск работы" — id 3781373837
 * Topic: "Контакты HR и Вакансии" — topic_id 33
 *
 * Run: node cli.js itptitsa-process [--dry-run]
 * Session: uses existing .telegram_session from platforms/telegram/
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_FILE = join(DATA_DIR, 'itptitsa-state.json');
const SHARE_STATE_FILE = join(DATA_DIR, 'itptitsa-share-state.json');

// IT-Птица. Поиск работы
const GROUP_ID = BigInt('-1003781373837');
const TOPIC_ID = 33; // "Контакты HR и Вакансии"
const MAX_DMS_PER_DAY = Number(process.env.ITPTITSA_MAX_DMS ?? 10);
const MSG_LIMIT = 50; // how many recent messages to scan

const HH_URL_RE = /https?:\/\/(?:[\w-]+\.)?hh\.ru\/vacancy\/\d+[^\s]*/gi;
const CAREER_URL_RE = /https?:\/\/[^\s]{10,}/gi;
const USERNAME_RE = /(?<![/\w])@([\w]{4,32})/g;

function loadState() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) {
    return { processedMsgIds: [], dmsToday: { date: '', count: 0 }, dmsSent: {} };
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

// Usernames already known from 2nd-account HR chats — never DM these
function loadShareKnownUsernames() {
  if (!existsSync(SHARE_STATE_FILE)) return new Set();
  try {
    const s = JSON.parse(readFileSync(SHARE_STATE_FILE, 'utf8'));
    return new Set(Object.keys(s.posted ?? {}).map(u => u.toLowerCase()));
  } catch {
    return new Set();
  }
}

// Ручной стоп-лист: контакты, которых написавший знает как уже отработанные
// (например, уже писал сам лично), но которые бот больше никак отследить не может —
// dmsSent и shareKnown видят только то, что сам бот/2-й аккаунт когда-то отправляли.
// Формат: data/itptitsa-excluded.json — JSON-массив юзернеймов, без @, любой регистр.
const EXCLUDE_FILE = join(DATA_DIR, 'itptitsa-excluded.json');
function loadExcludedUsernames() {
  if (!existsSync(EXCLUDE_FILE)) return new Set();
  try {
    const list = JSON.parse(readFileSync(EXCLUDE_FILE, 'utf8'));
    return new Set((Array.isArray(list) ? list : []).map(u => String(u).replace(/^@/, '').toLowerCase()));
  } catch {
    return new Set();
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dmsAllowedToday(state) {
  if (state.dmsToday.date !== todayStr()) {
    state.dmsToday = { date: todayStr(), count: 0 };
  }
  return state.dmsToday.count < MAX_DMS_PER_DAY;
}

function extractHhUrls(text) {
  return [...(text.matchAll(HH_URL_RE))].map(m => m[0].replace(/[,.)]+$/, ''));
}

function extractCareerUrls(text) {
  return [...(text.matchAll(CAREER_URL_RE))]
    .map(m => m[0].replace(/[,.)]+$/, ''))
    .filter(u => !u.includes('hh.ru') && !u.includes('t.me') && !u.includes('youtu'))
    .filter(u => /careers|career|jobs|vacancy|вакансии|apply/i.test(u));
}

function extractUsernames(text) {
  const IGNORE = /^(example|testuser|admin|noreply|postmaster|channelusername)/i;
  return [...new Set(
    [...(text.matchAll(USERNAME_RE))].map(m => m[1]).filter(u => !IGNORE.test(u))
  )];
}

async function buildClient() {
  const RVC_DIR = join(__dirname, '..', '..', '..', 'platforms', 'rvc');
  const credsPath = join(RVC_DIR, 'credentials.env');
  const creds = readFileSync(credsPath, 'utf8');

  const apiId = Number(creds.match(/TELEGRAM_API_ID=(\d+)/)?.[1]);
  const apiHash = creds.match(/TELEGRAM_API_HASH=(\w+)/)?.[1];
  const sessionFile = creds.match(/TELEGRAM_SESSION_FILE=(.+)/)?.[1]?.trim();
  const proxyUrl = creds.match(/TELEGRAM_PROXY_URL=(\S+)/)?.[1]?.trim();

  const { TelegramClient } = await import(join(RVC_DIR, 'node_modules', 'telegram', 'index.js'));
  const { StringSession } = await import(join(RVC_DIR, 'node_modules', 'telegram', 'sessions', 'index.js'));
  const { Api } = await import(join(RVC_DIR, 'node_modules', 'telegram', 'index.js'));

  const stored = existsSync(sessionFile) ? readFileSync(sessionFile, 'utf8').trim() : '';

  let proxy;
  if (proxyUrl) {
    const u = new URL(proxyUrl);
    proxy = { socksType: 5, ip: u.hostname, port: Number(u.port), timeout: 10 };
  }

  const client = new TelegramClient(
    new StringSession(stored),
    apiId,
    apiHash,
    { connectionRetries: 3, useWSS: false, proxy }
  );

  // Таймаут на connect: без него зависший прокси/сессия убивает процесс с exit 13
  // (unsettled top-level await), как это было 7 июля. Лучше явная ошибка + ретрай systemd.
  await withTimeout(client.connect(), 30_000, 'Telegram connect');
  return { client, Api };
}

/** Оборачивает промис таймаутом, чтобы сетевой зависон превращался в reject, а не в вечное ожидание. */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timeout ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function reactToMessage(client, Api, peer, msgId) {
  try {
    await client.invoke(new Api.messages.SendReaction({
      peer,
      msgId,
      reaction: [new Api.ReactionEmoji({ emoticon: '👍' })],
    }));
    return true;
  } catch (e) {
    // Ignore "already reacted" or flood errors
    if (/REACTION_ALREADY_SET|FLOOD/i.test(e.message)) return true;
    console.warn(`[itptitsa] react failed msgId=${msgId}: ${e.message}`);
    return false;
  }
}

const DM_TEXT = `Здравствуйте! Нашёл ваш контакт на hh.ru.

Frontend-разработчик, 5+ лет опыта. Последние 2,5 года — Альфа-Банк (React, TypeScript, Next.js, SSR). До этого — DNS Retail: e-commerce и SaaS-продукты. Готов к офферам.

Прикладываю резюме. Буду рад пообщаться!`;

const RESUME_PATH = join(__dirname, '..', '..', '..', 'resume_ru.pdf');

async function sendDM(client, username, dryRun) {
  if (dryRun) {
    console.log(`[itptitsa] [dry-run] DM → @${username}:`);
    console.log(DM_TEXT);
    console.log(`  + резюме: ${RESUME_PATH}`);
    return true;
  }

  try {
    await client.sendFile(username, {
      file: RESUME_PATH,
      caption: DM_TEXT,
    });
    return true;
  } catch (e) {
    console.warn(`[itptitsa] DM to @${username} failed: ${e.message}`);
    return false;
  }
}

async function enqueueHhUrl(url, dryRun) {
  if (dryRun) {
    console.log(`[itptitsa] [dry-run] enqueue HH → ${url}`);
    return 'dry_run';
  }
  try {
    const APPLY_DIR = join(__dirname, '..');
    const payload = JSON.stringify({
      sourceId: 'telegram:itptitsa',
      postId: url,
      postUrl: url,
      rawText: url,
      links: [url],
      dryRun: false,
      skipFitCheck: false,
    });
    const cmd = `echo '${payload.replace(/'/g, "'\\''")}' | node cli.js enqueue --stdin`;
    const { stdout } = await execAsync(cmd, { cwd: APPLY_DIR });
    const result = JSON.parse(stdout.trim().split('\n').pop() ?? '{}');
    return result.results?.[0]?.action ?? 'unknown';
  } catch (e) {
    console.warn(`[itptitsa] enqueue failed for ${url}: ${e.message}`);
    return 'error';
  }
}

export async function runItptitsa({ dryRun = false, limit = MSG_LIMIT } = {}) {
  const state = loadState();
  const processedSet = new Set(state.processedMsgIds);
  const shareKnown = loadShareKnownUsernames();
  const excluded = loadExcludedUsernames();

  // Reset dmsToday counter if new day
  if (state.dmsToday.date !== todayStr()) {
    state.dmsToday = { date: todayStr(), count: 0 };
  }

  const { client, Api } = await buildClient();

  // Peer for the group (supergroup)
  const peer = await client.getInputEntity(GROUP_ID);

  // Fetch recent messages from the topic (replyTo = topicId in forum groups)
  const messages = await withTimeout(
    client.getMessages(peer, { limit, replyTo: TOPIC_ID }),
    45_000,
    'getMessages topic',
  );

  console.log(`[itptitsa] fetched ${messages.length} messages from topic ${TOPIC_ID}`);

  const results = [];

  for (const msg of messages) {
    const msgId = Number(msg.id);
    const key = String(msgId);

    if (processedSet.has(key)) continue;

    const text = msg.message ?? '';
    if (!text || text.length < 5) continue;

    // Also extract links from entities
    const entityLinks = [];
    msg.entities?.forEach(entity => {
      if (entity?.className === 'MessageEntityTextUrl' && entity.url) {
        entityLinks.push(entity.url);
      }
      if (entity?.className === 'MessageEntityUrl') {
        entityLinks.push(text.slice(entity.offset, entity.offset + entity.length));
      }
    });

    const fullText = text + ' ' + entityLinks.join(' ');
    const hhUrls = [...new Set(extractHhUrls(fullText))];
    const careerUrls = [...new Set(extractCareerUrls(fullText))];
    const usernames = extractUsernames(fullText);

    if (!hhUrls.length && !careerUrls.length && !usernames.length) {
      // Mark processed even if no content to avoid re-checking
      processedSet.add(key);
      continue;
    }

    console.log(`[itptitsa] msg ${msgId}: hh=${hhUrls.length} career=${careerUrls.length} @=${usernames.length}`);

    const msgResult = { msgId, hhUrls, careerUrls, usernames, actions: [] };

    // 1. Enqueue HH.ru vacancies
    for (const url of hhUrls) {
      const action = await enqueueHhUrl(url, dryRun);
      console.log(`[itptitsa]   HH ${url.slice(0, 50)} → ${action}`);
      msgResult.actions.push({ type: 'hh', url, action });
    }

    // 2. Send DMs to HR contacts (rate limited)
    let deferredForLimit = false; // остались контакты, не отправленные из-за дневного лимита
    for (const username of usernames) {
      if (shareKnown.has(username.toLowerCase())) {
        console.log(`[itptitsa]   @${username} already contacted via 2nd account, skip`);
        continue;
      }
      if (excluded.has(username.toLowerCase())) {
        console.log(`[itptitsa]   @${username} in manual exclude list, skip`);
        continue;
      }
      // Telegram-юзернеймы регистронезависимы (@HR_Ivan === @hr_ivan) — ключ дедупа
      // должен быть нормализован, иначе один и тот же человек, упомянутый в разных
      // постах с другим регистром, проходит проверку дважды.
      const usernameKey = username.toLowerCase();
      if (state.dmsSent[usernameKey]) {
        console.log(`[itptitsa]   @${username} already DMed, skip`);
        continue;
      }
      if (!dmsAllowedToday(state)) {
        // Не теряем контакт: откладываем сообщение на следующий прогон (не реагируем, не помечаем обработанным)
        console.log(`[itptitsa]   DM limit reached (${MAX_DMS_PER_DAY}/day), defer @${username} → next run`);
        deferredForLimit = true;
        continue;
      }

      const ok = await sendDM(client, username, dryRun);
      if (ok) {
        if (!dryRun) {
          state.dmsSent[usernameKey] = { sentAt: new Date().toISOString(), msgId, username };
          state.dmsToday.count++;
          // Пишем на диск СРАЗУ после отправки, а не в конце обработки сообщения —
          // иначе краш между отправкой и финальным saveState() теряет запись, и
          // при рестарте бот повторно пишет тому же человеку (реальный случай:
          // краш exit 13 из-за зависшего top-level await на connect через прокси).
          saveState(state);
        }
        console.log(`[itptitsa]   ✅ DM → @${username}`);
        msgResult.actions.push({ type: 'dm', username, ok });
        await new Promise(r => setTimeout(r, 3000)); // polite delay
      }
    }

    // Если из-за дневного лимита остались неотправленные контакты — НЕ реагируем и НЕ помечаем
    // сообщение обработанным, чтобы оно вернулось на следующем прогоне и контакты не потерялись.
    if (deferredForLimit) {
      console.log(`[itptitsa]   ↩ msg ${msgId} отложено: контакты сверх дневного лимита уйдут на следующем прогоне`);
      results.push(msgResult);
      continue;
    }

    // 3. React 👍 to message
    if (!dryRun && (hhUrls.length || usernames.length)) {
      await reactToMessage(client, Api, peer, msgId);
      console.log(`[itptitsa]   👍 reacted to ${msgId}`);
    } else if (dryRun && (hhUrls.length || usernames.length)) {
      console.log(`[itptitsa]   [dry-run] would react 👍 to ${msgId}`);
    }

    processedSet.add(key);
    if (!dryRun) {
      state.processedMsgIds = [...processedSet];
      saveState(state);
    }

    results.push(msgResult);
    await new Promise(r => setTimeout(r, 500));
  }

  // Финальное сохранение: фиксируем сброс dmsToday даже если за прогон не было per-message сохранений
  if (!dryRun) {
    state.processedMsgIds = [...processedSet];
    saveState(state);
  }

  await client.disconnect();

  const hhTotal = results.reduce((n, r) => n + r.hhUrls.length, 0);
  const dmTotal = results.reduce((n, r) => n + r.actions.filter(a => a.type === 'dm' && a.ok).length, 0);
  console.log(`[itptitsa] done: messages_processed=${results.length} hh_enqueued=${hhTotal} dms_sent=${dmTotal}`);

  return { ok: true, processed: results.length, hhEnqueued: hhTotal, dmsSent: dmTotal, results };
}
