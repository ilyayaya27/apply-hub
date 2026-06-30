import { existsSync } from 'node:fs';
import { matchFieldKey, valueForFieldKey } from '../../lib/form-field-hints.js';
import { normalizeFormProfile } from '../../lib/form-profile.js';
import { config } from '../../lib/config.js';
import { getMarketAssets } from '../../lib/profile.js';

export const GOOGLE_FORM_LOAD_SELECTOR =
  '[role="listitem"], div[role="list"] [role="listitem"], form';

const TEXT_INPUT_SELECTOR =
  'input[type="text"]:not([disabled]), input[type="email"]:not([disabled]), input[type="url"]:not([disabled]), textarea:not([disabled])';

const FILE_INPUT_SELECTOR = 'input[type="file"]:not([disabled])';

/**
 * @param {import('playwright').Page} page
 * @param {import('playwright').ElementHandle<SVGElement | HTMLElement>} el
 */
export const getGoogleFieldLabel = async (page, el) => {
  const ariaLabel = await el.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const labelId = await el.getAttribute('aria-labelledby');
  if (labelId) {
    const text = await page.evaluate((id) => {
      const node = document.getElementById(id);
      return node?.textContent?.trim() ?? '';
    }, labelId);
    if (text) return text;
  }

  return (await el.getAttribute('placeholder'))?.trim() ?? '';
};

/**
 * @param {import('playwright').Page} page
 * @param {Record<string, unknown>} profile
 * @param {string} letter
 */
export const fillGoogleFormPage = async (page, profile, letter) => {
  const flat = normalizeFormProfile(profile);
  /** @type {Record<string, string>} */
  const filled = {};
  let fileFields = 0;

  const inputs = await page.$$(TEXT_INPUT_SELECTOR);
  for (const input of inputs) {
    if (!(await input.isVisible())) continue;
    const label = await getGoogleFieldLabel(page, input);
    const key = matchFieldKey(label);
    if (!key || key === 'resume') continue;
    const value = valueForFieldKey(flat, letter, key);
    if (!value) continue;
    await input.fill(value);
    filled[label || key] = value;
  }

  const files = await page.$$(FILE_INPUT_SELECTOR);
  for (const fileInput of files) {
    if (await fileInput.isVisible()) fileFields += 1;
  }

  return { filled, fileFields };
};

/**
 * @param {import('playwright').Page} page
 * @param {string} resumePath
 */
export const uploadGoogleFormResume = async (page, resumePath) => {
  const fileInput = page.locator(FILE_INPUT_SELECTOR).first();
  if ((await fileInput.count()) === 0 || !existsSync(resumePath)) return false;
  await fileInput.setInputFiles(resumePath);
  return true;
};

const clickIfVisible = async (page, texts) => {
  for (const text of texts) {
    const btn = page.getByRole('button', { name: text }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      return true;
    }
    const divBtn = page.locator(`div[role="button"]`).filter({ hasText: text }).first();
    if (await divBtn.isVisible().catch(() => false)) {
      await divBtn.click();
      return true;
    }
  }
  return false;
};

/**
 * @param {import('playwright').Page} page
 * @param {Record<string, unknown>} profile
 * @param {string} letter
 * @param {{ submit?: boolean, maxPages?: number, resumePath?: string }} opts
 */
export const runGoogleFormFlow = async (page, profile, letter, opts = {}) => {
  const { submit = false, maxPages = 5, resumePath = '' } = opts;
  await page.waitForSelector(GOOGLE_FORM_LOAD_SELECTOR, { timeout: 15_000 });

  /** @type {Record<string, string>} */
  const allFilled = {};
  let totalFileFields = 0;
  let submitted = false;

  for (let pageIdx = 0; pageIdx < maxPages; pageIdx += 1) {
    const { filled, fileFields } = await fillGoogleFormPage(page, profile, letter);
    Object.assign(allFilled, filled);
    totalFileFields += fileFields;

    if (resumePath) await uploadGoogleFormResume(page, resumePath);

    const hasNext = await clickIfVisible(page, ['Next', 'Далее', 'Continue']);
    if (hasNext) {
      await page.waitForTimeout(600);
      continue;
    }

    if (submit) {
      submitted = await clickIfVisible(page, ['Submit', 'Отправить', 'Send']);
    }
    break;
  }

  return { filled: allFilled, fileFields: totalFileFields, submitted };
};

/**
 * @param {{ primaryUrl?: string, url?: string }} vacancy
 * @param {{ profile: Record<string, unknown>, letter: string }} ctx
 */
export const applyGoogleForm = async (vacancy, { profile, letter }) => {
  const url = vacancy.primaryUrl ?? vacancy.url;
  if (!url) return { ok: false, status: 'failed', error: 'no_url' };

  if (!config.playwrightEnabled) {
    return {
      ok: false,
      status: 'needs_human',
      error: 'PLAYWRIGHT_ENABLED=false — Google Form требует браузер',
      adapter: 'google-forms',
      url,
    };
  }

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: config.playwrightHeadless });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });

    const { resume_path: resumePath } = getMarketAssets(profile);
    const result = await runGoogleFormFlow(page, profile, letter, {
      submit: config.formSubmit,
      resumePath,
    });

    await browser.close();

    if (result.submitted) {
      return {
        ok: true,
        status: 'applied',
        adapter: 'google-forms',
        note: `google form submit ${url}`,
        filled: result.filled,
      };
    }

    return {
      ok: false,
      status: 'needs_human',
      error: config.formSubmit
        ? 'Google Form: submit не нажат (капча или неизвестная разметка)'
        : 'FORM_SUBMIT=false — поля заполнены в dry-run, отправка вручную',
      adapter: 'google-forms',
      plan: { filled: result.filled, fileFields: result.fileFields },
    };
  } catch (err) {
    return {
      ok: false,
      status: 'needs_human',
      error: err.message ?? String(err),
      adapter: 'google-forms',
    };
  }
};
