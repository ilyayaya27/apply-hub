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

/** @type {Record<string, { applyButtonSelectors?: string[], waitFor?: string, submitSelectors?: string[] }>} */
export const PLATFORM_SPECS = {
  rwb_careers: CORP_RU,
  yandex_careers: CORP_RU,
  ozon_careers: CORP_RU,
  avito_careers: CORP_RU,
  sber_careers: CORP_RU,
  tbank_careers: CORP_RU,
  vk_careers: {
    applyButtonSelectors: [
      'a:has-text("Откликнуться")',
      'button:has-text("Откликнуться")',
      '[data-qa="vacancy-response"]',
    ],
    waitFor: 'form, [class*="application"]',
    submitSelectors: ['button[type="submit"]', 'input[type="submit"]'],
  },
  habr_career: {
    applyButtonSelectors: [
      'a:has-text("Откликнуться")',
      'button:has-text("Откликнуться")',
      'a:has-text("Respond")',
    ],
    waitFor: 'form',
    submitSelectors: ['button[type="submit"]', 'input[type="submit"]'],
  },
  djinni: {
    applyButtonSelectors: [
      'a:has-text("Apply")',
      'a:has-text("Откликнуться")',
      '.job-apply-button',
      '[data-testid="apply-button"]',
    ],
    waitFor: 'form, .application-form, textarea',
    submitSelectors: ['button[type="submit"]', 'input[type="submit"]'],
  },
  getmatch: {
    applyButtonSelectors: [
      'button:has-text("Откликнуться")',
      'a:has-text("Apply")',
      'a:has-text("Откликнуться")',
    ],
    waitFor: 'form',
    submitSelectors: ['button[type="submit"]'],
  },
  hirehi: {
    applyButtonSelectors: ['button:has-text("Откликнуться")', 'a:has-text("Откликнуться")'],
    waitFor: 'form',
    submitSelectors: ['button[type="submit"]'],
  },
  jobrockets: {
    applyButtonSelectors: [
      'button:has-text("Отклиться")',
      'a:has-text("Откликнуться")',
      'button:has-text("Apply")',
    ],
    waitFor: 'form',
    submitSelectors: ['button[type="submit"]'],
  },
};

/** @param {string} platformId */
export const platformSpec = (platformId) => PLATFORM_SPECS[platformId] ?? null;
