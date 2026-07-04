/**
 * Health-watchdog: следит, что критичные сервисы живы, и кричит в TG,
 * если что-то замолчало. Причина появления — харвест был мёртв 4 дня
 * незамеченным (bun не в PATH systemd).
 *
 * Проверки:
 *   - свежесть файлов-«пульсов» (harvest-latest.json, inbox-state.json)
 *   - активность systemd-сервисов (hh/telegram/linkedin worker)
 *
 * Алерт шлётся в «Избранное» только когда набор проблем изменился или
 * прошло >6ч с последнего (чтобы не спамить ежечасно). При восстановлении
 * отправляется «✅ всё снова работает».
 *
 * Run: node cli.js watchdog [--dry-run]
 * State: data/watchdog-state.json
 */
import { statSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sendToSavedMessages } from '../lib/tg-notify.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const STATE_FILE = join(DATA_DIR, 'watchdog-state.json');
const ROOT = join(__dirname, '..', '..', '..');
const RE_ALERT_MS = 6 * 60 * 60 * 1000; // повторять тот же алерт не чаще раза в 6ч

/**
 * harvest/hh воркеры спят вне рабочих часов (~8–21), поэтому ночью файл-пульс
 * легитимно не обновляется до 11ч подряд. offHoursMaxStaleMin даёт запас, но
 * многодневный простой (как 4-дневная смерть харвеста) всё равно ловится.
 * @type {{ name: string, kind: 'file' | 'service', path?: string, unit?: string, maxStaleMin?: number, offHoursMaxStaleMin?: number }[]}
 */
const CHECKS = [
  {
    name: 'Telegram harvest',
    kind: 'file',
    path: join(ROOT, 'platforms', 'telegram', 'logs', 'harvest-latest.json'),
    maxStaleMin: 360, // днём: харвест каждые ~10 мин, 6ч тишины = мёртв
    offHoursMaxStaleMin: 840, // ночью: до 14ч ок (штатный перерыв 21→08)
  },
  {
    name: 'Inbox monitor',
    kind: 'file',
    path: join(DATA_DIR, 'inbox-state.json'),
    maxStaleMin: 180, // таймер каждые 30 мин, 24/7
  },
  { name: 'hh-worker', kind: 'service', unit: 'hh-worker.service' },
  { name: 'telegram-worker', kind: 'service', unit: 'telegram-worker.service' },
  { name: 'linkedin-worker', kind: 'service', unit: 'linkedin-worker.service' },
];

/** Рабочие часы воркеров: 8:00–21:00 по локальному времени */
function isWorkHours() {
  const h = new Date().getHours();
  return h >= 8 && h < 21;
}

function loadState() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(STATE_FILE)) return { lastKey: '', lastAlertAt: 0 };
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastKey: '', lastAlertAt: 0 };
  }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function ageMinutes(path) {
  const mtime = statSync(path).mtimeMs;
  return Math.round((Date.now() - mtime) / 60000);
}

function serviceActive(unit) {
  try {
    const out = execSync(`systemctl --user is-active ${unit}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out === 'active';
  } catch {
    return false; // is-active возвращает не-ноль когда сервис не активен
  }
}

/** @returns {{ name: string, detail: string }[]} */
function runChecks() {
  const breaches = [];
  for (const c of CHECKS) {
    if (c.kind === 'file') {
      if (!existsSync(c.path)) {
        breaches.push({ name: c.name, detail: 'файл-пульс отсутствует' });
        continue;
      }
      const age = ageMinutes(c.path);
      const threshold =
        !isWorkHours() && c.offHoursMaxStaleMin ? c.offHoursMaxStaleMin : c.maxStaleMin ?? 360;
      if (age > threshold) {
        const h = Math.floor(age / 60);
        const m = age % 60;
        breaches.push({ name: c.name, detail: `тишина ${h ? `${h}ч ` : ''}${m}м (порог ${Math.round(threshold / 60)}ч)` });
      }
    } else if (c.kind === 'service') {
      if (!serviceActive(c.unit)) {
        breaches.push({ name: c.name, detail: 'сервис не active' });
      }
    }
  }
  return breaches;
}

export async function runWatchdog({ dryRun = false } = {}) {
  const state = loadState();
  const breaches = runChecks();
  const key = breaches.map((b) => b.name).sort().join('|');
  const now = Date.now();

  let sent = false;

  if (breaches.length) {
    const changed = key !== state.lastKey;
    const stale = now - (state.lastAlertAt ?? 0) > RE_ALERT_MS;
    if (changed || stale) {
      const lines = ['🚨 apply-hub: проблемы со сервисами', ''];
      for (const b of breaches) lines.push(`❌ ${b.name} — ${b.detail}`);
      await sendToSavedMessages(lines.join('\n'), { dryRun });
      sent = true;
    }
    if (!dryRun) saveState({ lastKey: key, lastAlertAt: sent ? now : state.lastAlertAt });
  } else {
    // Восстановление: были проблемы → теперь всё ок
    if (state.lastKey) {
      await sendToSavedMessages('✅ apply-hub: все сервисы снова работают', { dryRun });
      sent = true;
    }
    if (!dryRun) saveState({ lastKey: '', lastAlertAt: sent ? now : state.lastAlertAt });
  }

  console.log(
    `[watchdog] breaches=${breaches.length}${breaches.length ? ` (${key})` : ''} alert_sent=${sent}${dryRun ? ' [dry-run]' : ''}`,
  );
  return { ok: true, breaches, alertSent: sent };
}
