/** Per-site Playwright hints (Phase 3). Generic html-form remains fallback. */

/** RU corporate career sites — shared until a site needs custom selectors. */
const CORP_RU = {
  applyButtonSelectors: [
    'a:has-text("Откликнуться")',
    'button:has-text("Откликнуться")',
    'a:has-text("Отклиться")',
    'button:has-text("Отклиться")',
    'a:has-text("Apply")',
    'button:has-text("Apply")',
  ],
  waitFor: 'form, [class*="application"], [class*="vacancy"]',
  submitSelectors: ['button[type="submit"]', 'input[type="submit"]'],
};

const UA_CHROME =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ANTIBOT_ARGS = ['--disable-blink-features=AutomationControlled'];

/**
 * @type {Record<string, {
 *   applyButtonSelectors?: string[],
 *   waitFor?: string,
 *   submitSelectors?: string[],
 *   formless?: boolean,
 *   pageSettleMs?: number,
 *   browserArgs?: string[],
 *   browserUserAgent?: string,
 *   allowAutoSubmit?: boolean,
 * }>}
 */
export const PLATFORM_SPECS = {
  rwb_careers: { ...CORP_RU, allowAutoSubmit: true },

  /**
   * React SPA — требует Яндекс-аккаунт.
   * login-once: node platforms/apply/login-once.js yandex_careers
   * После логина: allowAutoSubmit: true
   */
  yandex_careers: {
    formless: true,
    pageSettleMs: 6_000,
    browserArgs: ANTIBOT_ARGS,
    browserUserAgent: UA_CHROME,
    requiresSession: true,
    applyButtonSelectors: [
      'button:has-text("Откликнуться")',
      'a:has-text("Откликнуться")',
      '[class*="VacancyResponseButton"]',
      'button[data-testid*="response"]',
    ],
    waitFor: 'input[type="email"], input[placeholder], textarea',
    submitSelectors: [
      'button:has-text("Отправить")',
      'button:has-text("Откликнуться")',
      'button[type="submit"]',
    ],
    allowAutoSubmit: true,
  },

  /** Vue modal без <form>; поля по placeholder/id */
  ozon_careers: {
    ...CORP_RU,
    formless: true,
    pageSettleMs: 12_000,
    browserArgs: ANTIBOT_ARGS,
    browserUserAgent: UA_CHROME,
    waitFor: 'input[placeholder="Email"], input[placeholder="Фамилия"]',
    submitSelectors: [
      'button:has-text("Отправить отклик")',
      'button[type="submit"]',
      'input[type="submit"]',
    ],
    allowAutoSubmit: true,
  },

  avito_careers: { ...CORP_RU, allowAutoSubmit: true },

  /** SPA с динамическим рендером формы — smoke OK 2026-07-01 (5 полей + резюме) */
  sber_careers: {
    ...CORP_RU,
    formless: true,
    pageSettleMs: 8_000,
    browserArgs: ANTIBOT_ARGS,
    browserUserAgent: UA_CHROME,
    waitFor: 'input[type="text"], input[type="email"], textarea',
    allowAutoSubmit: true,
  },

  /** SPA — проверить URL и форму после smoke */
  tbank_careers: { ...CORP_RU, allowAutoSubmit: false },

  /**
   * team.vk.company — обычные вакансии. allowAutoSubmit: true (smoke OK 2026-07-01).
   * internship.vk.company требует DOB + year_admission/graduation — отдельно не поддерживается.
   */
  vk_careers: {
    applyButtonSelectors: [
      'a:has-text("Откликнуться")',
      'button:has-text("Откликнуться")',
      '[data-qa="vacancy-response"]',
    ],
    waitFor: 'form, [class*="application"]',
    submitSelectors: ['button[type="submit"]', 'input[type="submit"]'],
    allowAutoSubmit: true,
  },

  habr_career: {
    applyButtonSelectors: [
      'a:has-text("Откликнуться")',
      'button:has-text("Откликнуться")',
      'a:has-text("Respond")',
    ],
    waitFor: 'form',
    submitSelectors: ['button[type="submit"]', 'input[type="submit"]'],
    allowAutoSubmit: false,
  },

  djinni: {
    formless: true,
    pageSettleMs: 4_000,
    applyButtonSelectors: [
      'button:has-text("Apply")',
      'button:has-text("Відгукнутись")',
      'button:has-text("Відгукнутися")',
      'a:has-text("Apply")',
    ],
    waitFor: 'textarea, .modal textarea, [class*="cover"]',
    submitSelectors: [
      'button:has-text("Send")',
      'button:has-text("Надіслати")',
      'button[type="submit"]',
    ],
    allowAutoSubmit: true,
  },

  getmatch: {
    applyButtonSelectors: [
      'button:has-text("Откликнуться")',
      'a:has-text("Apply")',
      'a:has-text("Откликнуться")',
    ],
    waitFor: 'form',
    submitSelectors: ['button[type="submit"]'],
    allowAutoSubmit: false,
  },

  hirehi: {
    applyButtonSelectors: ['button:has-text("Откликнуться")', 'a:has-text("Откликнуться")'],
    waitFor: 'form',
    submitSelectors: ['button[type="submit"]'],
    allowAutoSubmit: false,
  },

  jobrockets: {
    applyButtonSelectors: [
      'button:has-text("Отклиться")',
      'a:has-text("Откликнуться")',
      'button:has-text("Apply")',
    ],
    waitFor: 'form',
    submitSelectors: ['button[type="submit"]'],
    allowAutoSubmit: false,
  },

  beeline_careers: {
    ...CORP_RU,
    formless: true,
    pageSettleMs: 6_000,
    browserArgs: ANTIBOT_ARGS,
    browserUserAgent: UA_CHROME,
    waitFor: 'input[type="text"], input[type="email"], textarea, [class*="form"]',
    allowAutoSubmit: true,
  },

  moysklad_careers: {
    ...CORP_RU,
    formless: true,
    pageSettleMs: 6_000,
    browserArgs: ANTIBOT_ARGS,
    browserUserAgent: UA_CHROME,
    waitFor: 'input[type="text"], input[type="email"], textarea, [class*="form"]',
    allowAutoSubmit: false,
  },

  alfabank_careers: {
    ...CORP_RU,
    formless: true,
    pageSettleMs: 6_000,
    browserArgs: ANTIBOT_ARGS,
    browserUserAgent: UA_CHROME,
    waitFor: 'input[type="text"], input[type="email"], textarea, [class*="form"]',
    allowAutoSubmit: false,
  },

  cloudru_careers: { ...CORP_RU, allowAutoSubmit: true },
};

/** @param {string} platformId */
export const platformSpec = (platformId) => PLATFORM_SPECS[platformId] ?? null;
