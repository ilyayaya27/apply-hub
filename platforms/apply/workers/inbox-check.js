/**
 * Мониторинг входящих ответов на email-отклики.
 *
 * Читает INBOX по IMAP (те же креды что SMTP), находит новые письма,
 * фильтрует релевантные (ответы компаний, приглашения, ATS-подтверждения)
 * и шлёт уведомление в Telegram «Избранное» через GramJS-сессию.
 *
 * Run: node cli.js inbox-check [--dry-run]
 * State: data/inbox-state.json — lastUid, чтобы не дублировать
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../lib/config.js';
import { sendToSavedMessages } from '../lib/tg-notify.js';
import { getDb } from '../lib/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_FILE = join(DATA_DIR, 'inbox-state.json');

// Релевантные письма: ответы на отклики / приглашения / ATS
const RELEVANT_RE =
  /interview|собеседован|интервью|vacancy|ваканси|position|отклик|заявк|application|candidat|кандидат|оффер|offer|next step|schedule|звонок|созвон|hr|recruit|рекрут|talent|hiring|резюме|resume|cv\b/i;

// Мусор: рассылки, промо, соцсети-нотификации
const NOISE_FROM_RE =
  /no-?reply@(?:accounts\.google|youtube|facebook|twitter|x\.com)|newsletter|digest@|promo@|marketing@|@(?:mailer|email)\.|notifications@github/i;

function loadState() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) return { lastUid: 0, notified: [] };
  return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/** Адреса, на которые мы откликались (для приоритета "это точно ответ") */
function loadAppliedAddresses() {
  const addrs = new Set();
  try {
    const hn = JSON.parse(readFileSync(join(DATA_DIR, 'hn-hiring-state.json'), 'utf8'));
    const applied = hn.applied ?? {};
    for (const key of Object.keys(applied)) {
      const note = applied[key]?.note ?? '';
      const m = note.match(/email to (\S+@\S+)/);
      if (m) addrs.add(m[1].toLowerCase());
    }
  } catch {}
  return addrs;
}

export async function runInboxCheck({ dryRun = false } = {}) {
  const user = config.smtpUser || process.env.SMTP_USER;
  const pass = config.smtpPass || process.env.SMTP_PASS;
  if (!user || !pass) {
    return { ok: false, error: 'SMTP_USER/SMTP_PASS не заданы — нечем логиниться в IMAP' };
  }

  const state = loadState();
  const appliedAddrs = loadAppliedAddresses();

  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');

  const hits = [];
  try {
    const totalUidNext = client.mailbox.uidNext;
    // Первый запуск: берём только последние ~20 писем, не всю почту
    const sinceUid = state.lastUid > 0 ? state.lastUid + 1 : Math.max(1, totalUidNext - 20);

    for await (const msg of client.fetch(
      { uid: `${sinceUid}:*` },
      { uid: true, envelope: true, bodyStructure: false },
    )) {
      if (msg.uid < sinceUid) continue;
      const from = msg.envelope?.from?.[0] ?? {};
      const fromAddr = (from.address ?? '').toLowerCase();
      const fromName = from.name ?? '';
      const subject = msg.envelope?.subject ?? '';
      const date = msg.envelope?.date ?? null;

      state.lastUid = Math.max(state.lastUid, msg.uid);

      if (fromAddr === user.toLowerCase()) continue; // свои же письма
      if (NOISE_FROM_RE.test(fromAddr)) continue;

      const isDirectReply = appliedAddrs.has(fromAddr)
        || [...appliedAddrs].some((a) => a.split('@')[1] === fromAddr.split('@')[1]);
      const isRelevant = RELEVANT_RE.test(subject) || RELEVANT_RE.test(fromName) || RELEVANT_RE.test(fromAddr);

      if (!isDirectReply && !isRelevant) continue;

      hits.push({
        uid: msg.uid,
        fromAddr,
        fromName,
        from: `${fromName} <${fromAddr}>`.trim(),
        subject,
        date: date ? new Date(date).toISOString() : null,
        priority: isDirectReply ? 'reply' : 'relevant',
      });
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }

  console.log(`[inbox] новых релевантных: ${hits.length} (lastUid=${state.lastUid})`);

  // Персистим ответы в БД (для воронки cli.js funnel), с best-effort привязкой к вакансии.
  if (hits.length && !dryRun) {
    persistReplies(hits);
  }

  if (hits.length) {
    const lines = ['📬 Ответы на отклики:'];
    for (const h of hits) {
      const mark = h.priority === 'reply' ? '🔥' : '✉️';
      lines.push(`\n${mark} ${h.from}\n   ${h.subject}`);
    }
    await sendToSavedMessages(lines.join('\n'), { dryRun });
  }

  if (!dryRun) saveState(state);

  return { ok: true, newRelevant: hits.length, hits };
}

/** Сохраняет ответы в email_replies (dedup по uid) + пытается связать с откликнутой вакансией. */
function persistReplies(hits) {
  const db = getDb(config.dbPath);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO email_replies (uid, from_addr, from_name, subject, received_at, priority, matched_vacancy_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const findVacancy = db.prepare(
    `SELECT vacancy_id FROM applications WHERE error IS NULL AND note LIKE ? ORDER BY applied_at DESC LIMIT 1`,
  );
  for (const h of hits) {
    let matched = null;
    if (h.fromAddr) {
      const row = findVacancy.get(`%email to ${h.fromAddr}%`);
      matched = row?.vacancy_id ?? null;
    }
    insert.run(h.uid, h.fromAddr ?? '', h.fromName ?? '', h.subject ?? '', h.date ?? '', h.priority, matched);
  }
}
