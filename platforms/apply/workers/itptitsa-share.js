/**
 * Читает HR-чаты второго аккаунта, извлекает контакты и
 * постит их в IT-Птица "Контакты HR и Вакансии" (topic 33).
 *
 * Второй аккаунт: .telegram_session_work — читает чаты
 * Первый аккаунт: .telegram_session — постит в IT-Птица
 *
 * Run: node cli.js itptitsa-share [--dry-run]
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RVC_DIR = join(__dirname, '..', '..', '..', 'platforms', 'rvc');
const TG_DIR = join(__dirname, '..', '..', '..', 'platforms', 'telegram');
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_FILE = join(DATA_DIR, 'itptitsa-share-state.json');

// IT-Птица group + topic
const GROUP_ID = BigInt('-1003781373837');
const TOPIC_ID = 33;

// Only look at chats from the last 7 days
const SCAN_DAYS = 7;
const CUTOFF_MS = SCAN_DAYS * 24 * 3600 * 1000;

// HR detection patterns
const HR_NAME_RE = /hr|рекрутер|recruiter|talent|hiring|кадры/i;
const HR_MSG_RE = /вакансия|позиция|vacancy|offer|оффер|резюме|кандидат|стек|опыт|зарплата|зп|salary/i;
const REJECT_RE = /к сожалени|не подход|не рассматр|закрыли|закрыта|не актуальна|отказ|не подошл|не соответств/i;

// Skip — vacancy closed, nothing to share
const CLOSED_RE = /вакансия.{0,20}(не актуальна|закрыт|закрыли)|не актуальна|позиция закрыт|закрыли вакансию/i;
// Skip — they don't hire from RF/outside country/require relocation
const GEO_REJECT_RE = /не рассматр.{0,30}(РФ|Россия|локаци|за пределами)|кандидатов с локацией РФ|за пределами РБ|вне РФ|только.{0,15}офис|локальн.{0,20}кандидат|только.*Кипр|сфокусировал.{0,20}локальн/i;

function loadState() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) return { posted: {} };
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function buildClient(sessionFile) {
  const creds = readFileSync(join(RVC_DIR, 'credentials.env'), 'utf8');
  const API_ID = Number(creds.match(/TELEGRAM_API_ID=(\d+)/)?.[1]);
  const API_HASH = creds.match(/TELEGRAM_API_HASH=(\w+)/)?.[1];
  const PROXY_URL = creds.match(/TELEGRAM_PROXY_URL=(\S+)/)?.[1]?.trim();

  const { TelegramClient } = await import(join(RVC_DIR, 'node_modules', 'telegram', 'index.js'));
  const { StringSession } = await import(join(RVC_DIR, 'node_modules', 'telegram', 'sessions', 'index.js'));

  let proxy;
  if (PROXY_URL) {
    const u = new URL(PROXY_URL);
    proxy = { socksType: 5, ip: u.hostname, port: Number(u.port), timeout: 10 };
  }

  const stored = readFileSync(sessionFile, 'utf8').trim();
  const client = new TelegramClient(new StringSession(stored), API_ID, API_HASH, {
    connectionRetries: 3, useWSS: false, proxy,
  });
  await client.connect();
  return client;
}

function extractRole(messages) {
  // Look for role/stack mentions in conversation
  const combined = messages.map(m => m.message ?? '').join(' ');
  const roleMatch = combined.match(/(?:react|vue|angular|typescript|javascript|frontend|fullstack|node\.?js|python|backend)[^.!?\n]*/i);
  const salaryMatch = combined.match(/\d[\d\s]*(?:тыс|к|000)\s*(?:руб|₽|rub)?/i);
  return {
    stack: roleMatch?.[0]?.trim().slice(0, 80) ?? null,
    salary: salaryMatch?.[0]?.trim() ?? null,
  };
}

function formatPost(contact) {
  const lines = [];
  lines.push(`👤 ${contact.name}${contact.username ? ` — @${contact.username}` : ''}`);
  if (contact.salary) lines.push(`💰 ${contact.salary}`);
  lines.push(`📌 ${contact.status}`);
  if (contact.lastMsg) lines.push(`\n💬 "${contact.lastMsg.slice(0, 150)}"`);
  return lines.join('\n');
}

export async function runItptitsaShare({ dryRun = false } = {}) {
  const state = loadState();

  // Connect both accounts
  const workClient = await buildClient(join(TG_DIR, '.telegram_session_work'));
  const mainClient = await buildClient(join(TG_DIR, '.telegram_session'));

  const workMe = await workClient.getMe();
  const myId = workMe.id;
  console.log(`[share] Второй аккаунт: ${workMe.firstName} (@${workMe.username ?? workMe.phone})`);

  // Scan private chats of second account
  const dialogs = await workClient.getDialogs({ limit: 100 });
  const cutoff = Date.now() - CUTOFF_MS;

  const hrChats = [];

  for (const d of dialogs) {
    if (d.isGroup || d.isChannel) continue; // private only

    const name = d.title ?? d.name ?? '';
    const lastMsg = d.message?.message ?? '';
    const lastDate = (d.message?.date ?? 0) * 1000;

    if (lastDate < cutoff) continue; // too old

    const isHrByName = HR_NAME_RE.test(name);
    const isHrByMsg = HR_MSG_RE.test(lastMsg);

    if (!isHrByName && !isHrByMsg) continue;

    // Only share if THEY sent the last message (not us)
    const lastSenderId = d.message?.fromId?.userId ?? d.message?.peerId?.userId;
    const lastIsFromThem = lastSenderId && String(lastSenderId) !== String(myId);
    // Also accept if message has no fromId but dialog is private (outgoing=false)
    const isIncoming = d.message?.out === false;
    if (!lastIsFromThem && !isIncoming) continue;

    const username = d.entity?.username ?? null;
    const key = username ?? String(d.entity?.id ?? name);

    if (state.posted[key]) continue; // already shared

    hrChats.push({ d, name, username, lastMsg, key });
  }

  console.log(`[share] Найдено HR-чатов для шаринга: ${hrChats.length}`);

  // Filter chats: check messages, apply skip rules, collect contacts
  const contacts = [];

  for (const { d, name, username, lastMsg, key } of hrChats) {
    let messages = [];
    try {
      messages = await workClient.getMessages(d.entity, { limit: 10 });
    } catch {}

    const allText = [lastMsg, ...messages.map(m => m.message ?? '')].join(' ');

    if (CLOSED_RE.test(allText)) {
      console.log(`[share] skip (закрыта): ${name}`);
      if (!dryRun) {
        state.posted[key] = { postedAt: new Date().toISOString(), name, skipped: 'closed' };
        saveState(state);
      }
      continue;
    }

    if (GEO_REJECT_RE.test(allText)) {
      console.log(`[share] skip (гео): ${name}`);
      if (!dryRun) {
        state.posted[key] = { postedAt: new Date().toISOString(), name, skipped: 'geo' };
        saveState(state);
      }
      continue;
    }

    const hasRejection = REJECT_RE.test(lastMsg) || messages.some(m => REJECT_RE.test(m.message ?? ''));
    const status = hasRejection ? 'получил отказ / стек не подошёл' : 'вакансия может быть актуальна';
    contacts.push({ key, name, username, status, lastMsg });
    console.log(`[share] ✔ ${name} (@${username ?? '-'}) — ${status}`);
  }

  await workClient.disconnect();

  if (!contacts.length) {
    console.log('[share] нет новых контактов для шаринга');
    await mainClient.disconnect();
    return { ok: true, found: hrChats.length, posted: 0, results: [] };
  }

  // Build single combined post
  const today = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const header = `📋 HR-контакты за неделю (${today}):\n`;
  const blocks = contacts.map(c => formatPost(c));
  const fullPost = header + '\n' + blocks.join('\n\n');

  console.log(`\n[share] Итоговое сообщение:\n${fullPost}`);

  if (dryRun) {
    await mainClient.disconnect();
    return { ok: true, found: hrChats.length, posted: 0, dryRun: true, contacts };
  }

  let posted = 0;
  try {
    const mainPeer = await mainClient.getInputEntity(GROUP_ID);
    await mainClient.sendMessage(mainPeer, {
      message: fullPost,
      replyTo: TOPIC_ID,
    });
    // Mark all as posted
    for (const { key, name } of contacts) {
      state.posted[key] = { postedAt: new Date().toISOString(), name };
    }
    saveState(state);
    posted = contacts.length;
    console.log(`[share] ✅ запостили в IT-Птица (${posted} контактов)`);
  } catch (e) {
    console.warn(`[share] ❌ ошибка отправки: ${e.message}`);
  }

  await mainClient.disconnect();

  console.log(`\n[share] done: found=${hrChats.length} contacts=${contacts.length} posted=${posted}`);
  return { ok: true, found: hrChats.length, contacts: contacts.length, posted };
}
