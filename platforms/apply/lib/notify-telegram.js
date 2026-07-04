import { config } from './config.js';
import { sendToSavedMessages } from './tg-notify.js';

const lastSent = new Map();

/** Без бота через GramJS «Избранное» шлём только редкие сводки (не флудим на каждый match) */
const SAVED_MSG_KINDS = new Set(['needs_human', 'daily_summary']);

export function shouldNotify(kind) {
  const allowed = config.notifyOn ?? [];
  return allowed.includes(kind);
}

function throttleKey(chatId, text) {
  return `${chatId}:${text.slice(0, 80)}`;
}

export function isThrottled(chatId, text) {
  const key = throttleKey(chatId, text);
  const prev = lastSent.get(key) ?? 0;
  const now = Date.now();
  if (now - prev < (config.notifyThrottleSec ?? 60) * 1000) return true;
  lastSent.set(key, now);
  return false;
}

export async function sendTelegramNotify(text, { kind = 'match' } = {}) {
  if (!shouldNotify(kind)) return { ok: false, skipped: 'notify_off' };

  const token = config.telegramNotifyBotToken;
  const chatId = config.telegramNotifyChatId;
  if (!token || !chatId) {
    // Бота от BotFather нет — важные сводки шлём через свою GramJS-сессию в «Избранное».
    if (SAVED_MSG_KINDS.has(kind)) {
      try {
        await sendToSavedMessages(text);
        return { ok: true, via: 'saved_messages' };
      } catch (err) {
        console.log(`[notify:${kind}] ${text}`);
        return { ok: false, skipped: 'saved_messages_failed', error: String(err?.message ?? err) };
      }
    }
    console.log(`[notify:${kind}] ${text}`);
    return { ok: false, skipped: 'no_credentials' };
  }

  if (isThrottled(chatId, text)) {
    return { ok: false, skipped: 'throttled' };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = new URLSearchParams({
    chat_id: chatId,
    text: text.slice(0, 4000),
    disable_web_page_preview: 'true',
  });

  const res = await fetch(url, { method: 'POST', body });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, error: errText };
  }
  return { ok: true };
}

export function formatMatchNotify(result) {
  return `✅ Match ${result.fitScore} | ${result.route}\n${result.title ?? '—'}\n${result.url ?? ''}`;
}

export function formatApplyNotify({ title, route, ok, note, error }) {
  if (ok) return `📤 Applied | ${route}\n${title ?? '—'}\n${note ?? ''}`;
  return `⚠️ Apply failed | ${route}\n${title ?? '—'}\n${error ?? note ?? ''}`;
}

export function formatDailySummary(stats) {
  return (
    `📊 Job hub daily\n` +
    `Scanned: ${stats.scanned ?? 0}\n` +
    `Queued: ${stats.queued ?? 0}\n` +
    `Applied today: ${stats.appliedToday ?? 0}\n` +
    `Queue left: ${stats.queueLeft ?? 0}`
  );
}
