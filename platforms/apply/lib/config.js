import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');

const loadEnvFile = (path) => {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const idx = line.indexOf('=');
        if (idx === -1) return [line, ''];
        const raw = line.slice(idx + 1).trim();
        const val =
          (raw.startsWith('"') && raw.endsWith('"')) ||
          (raw.startsWith("'") && raw.endsWith("'"))
            ? raw.slice(1, -1)
            : raw;
        return [line.slice(0, idx).trim(), val];
      }),
  );
};

const env = {
  ...loadEnvFile(join(ROOT, 'credentials.env.example')),
  ...loadEnvFile(join(ROOT, 'credentials.env')),
  ...process.env,
};

const num = (key, fallback) => {
  const v = Number(env[key]);
  return Number.isFinite(v) ? v : fallback;
};

const bool = (key, fallback) => {
  const v = env[key];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

const list = (key, fallback) => {
  const v = env[key];
  if (!v) return fallback;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
};

export const getDbPath = () =>
  process.env.JOB_HUB_DB ?? join(ROOT, 'data', 'vacancies.db');

export const getStatePath = () =>
  process.env.STATE_PATH ?? process.env.JOB_HUB_STATE_PATH ?? join(ROOT, 'state.json');

export const config = {
  root: ROOT,
  activeMarket: (env.JOB_HUB_ACTIVE_MARKET ?? 'ru').toLowerCase(),
  channel: env.RVC_CHANNEL ?? 'revacancy',
  globalChannel: env.RVC_GLOBAL_CHANNEL ?? 'revacancy_global',
  coverLetterPath: env.COVER_LETTER_PATH ?? join(ROOT, '../../letter.txt'),
  resumePath: env.RESUME_PATH ?? join(ROOT, '../../resume_ru.pdf'),
  minFitScore: num('MIN_FIT_SCORE', 55),
  maxAppliesPerDay: num('MAX_APPLIES_PER_DAY', 15),
  maxFormAppliesPerDay: num('MAX_FORM_APPLIES_PER_DAY', 8),
  maxEmailAppliesPerDay: num('MAX_EMAIL_APPLIES_PER_DAY', 5),
  applyDelayMsMin: num('APPLY_DELAY_MS_MIN', 30_000),
  applyDelayMsMax: num('APPLY_DELAY_MS_MAX', 120_000),
  captchaCooldownMin: num('CAPTCHA_COOLDOWN_MIN', 60),
  companyCooldownDays: num('COMPANY_COOLDOWN_DAYS', 30),
  monitorIntervalMin: num('MONITOR_INTERVAL_MIN', 3),
  autoApply: bool('AUTO_APPLY', false),
  /** Phase 1 default: dry-run unless APPLY_DRY_RUN=0 */
  dryRun: env.APPLY_DRY_RUN !== '0',
  get statePath() {
    return getStatePath();
  },
  get dbPath() {
    return getDbPath();
  },
  telegramNotifyBotToken: env.TELEGRAM_NOTIFY_BOT_TOKEN ?? '',
  telegramNotifyChatId: env.TELEGRAM_NOTIFY_CHAT_ID ?? '',
  notifyOn: list('NOTIFY_ON', ['match', 'applied', 'failed', 'needs_human', 'daily_summary']),
  notifyThrottleSec: num('NOTIFY_THROTTLE_SEC', 60),
  notifyCmd: env.NOTIFY_CMD ?? '',
  smtpHost: env.SMTP_HOST ?? '',
  smtpPort: num('SMTP_PORT', 587),
  smtpUser: env.SMTP_USER ?? '',
  smtpPass: env.SMTP_PASS ?? '',
  smtpFrom: env.SMTP_FROM ?? '',
  applyEmail: env.APPLY_EMAIL ?? '',
  applyName: env.APPLY_NAME ?? 'Ilya Silkin',
  playwrightEnabled: bool('PLAYWRIGHT_ENABLED', false),
  playwrightHeadless: bool('PLAYWRIGHT_HEADLESS', true),
  /** true = click Submit on forms; default dry-run (fill only) */
  formSubmit: bool('FORM_SUBMIT', bool('PLAYWRIGHT_SUBMIT', false)),
  /**
   * Авто-сабмит НЕизвестных generic-форм (html/google) без пер-платформенной
   * проверки. По умолчанию false: незнакомую форму только заполняем, не шлём
   * вслепую реальному работодателю. Career-адаптеры гейтятся своим allowAutoSubmit.
   */
  formSubmitGeneric: bool('FORM_SUBMIT_GENERIC', false),
  openrouterApiKey: env.OPENROUTER_API_KEY ?? '',
  openrouterBaseUrl: env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
  openrouterModel: env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini',
  groqApiKey: env.GROQ_API_KEY ?? '',
  groqBaseUrl: env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1',
  groqModel: env.GROQ_MODEL ?? 'llama3-8b-8192',
  /** preview = t.me/s HTML; gramjs = user session (apply-hub/platforms/telegram) */
  tgIngestMode: (env.TG_INGEST_MODE ?? 'preview').toLowerCase(),
  telegramApiId: num('TELEGRAM_API_ID', 0),
  telegramApiHash: env.TELEGRAM_API_HASH ?? '',
  telegramSessionFile:
    env.TELEGRAM_SESSION_FILE ??
    join(ROOT, '..', 'telegram', '.telegram_session'),
  telegramUseWss: bool('TELEGRAM_USE_WSS', false),
  tgGramJsLimit: num('TG_GRAMJS_LIMIT', 50),
  tgGramJsMaxAgeHours: num('TG_GRAMJS_MAX_AGE_HOURS', 168),
  /** If GramJS fails, fall back to t.me/s preview scrape */
  tgIngestFallbackPreview: bool('TG_INGEST_FALLBACK_PREVIEW', true),
};

export const channelPreviewUrl = (channel) => `https://t.me/s/${channel}`;
