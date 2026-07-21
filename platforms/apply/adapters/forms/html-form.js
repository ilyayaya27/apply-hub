import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { matchFieldKey, valueForFieldKey } from '../../lib/form-field-hints.js';
import { normalizeFormProfile } from '../../lib/form-profile.js';
import { config } from '../../lib/config.js';
import { getMarketAssets } from '../../lib/profile.js';
import { enrichPlanWithAiAnswers } from '../../lib/ai-screening.js';

/**
 * @param {string} name
 */
export const fieldNameSelector = (name) => {
  const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `[name="${escaped}"]`;
};

/**
 * @param {import('cheerio').CheerioAPI} $
 * @param {cheerio.Element} el
 */
export const fieldSelectorFromElement = ($, el) => {
  const id = $(el).attr('id');
  if (id) return `#${id.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$&')}`;
  const placeholder = $(el).attr('placeholder');
  if (placeholder) {
    const esc = placeholder.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `[placeholder="${esc}"]`;
  }
  const name = $(el).attr('name');
  if (name) return fieldNameSelector(name);
  return null;
};

/**
 * Vue/modals without <form> — match by placeholder, id, aria-label.
 * @param {string} html
 * @param {Record<string, unknown>} profile
 * @param {string} letter
 */
export const planFormFillFormlessFromHtml = (html, profile, letter) => {
  const $ = cheerio.load(html);
  const flat = normalizeFormProfile(profile);
  /** @type {{ selector: string, type: string, tag: string, value: string, key?: string }[]} */
  const fields = [];

  $('input, textarea, select').each((_, el) => {
    const tag = el.tagName?.toLowerCase() ?? 'input';
    const type = ($(el).attr('type') ?? 'text').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button') return;

    const selector = fieldSelectorFromElement($, el);
    if (!selector) return;

    if (type === 'file') {
      fields.push({ selector, type, tag, value: '' });
      return;
    }

    // <label for=id> — надёжнее placeholder, который часто просто пример
    // формата ("+7 (912) ...") без слова "телефон".
    const id = $(el).attr('id');
    const forLabel = id ? $(`label[for="${id}"]`).text().trim() : '';
    const closestLabel = forLabel ? '' : $(el).closest('label').text().trim();
    const label =
      forLabel ||
      closestLabel ||
      $(el).attr('aria-label') ||
      $(el).attr('placeholder') ||
      $(el).attr('name') ||
      '';

    let value = $(el).attr('value') ?? '';
    const key = matchFieldKey(label);
    if (key) value = valueForFieldKey(flat, letter, key);
    if (tag === 'textarea' && !value && key === 'coverLetter') value = letter;
    if (tag === 'textarea' && !value) value = letter;

    if (!value && type !== 'checkbox' && type !== 'radio') return;

    fields.push({
      selector,
      type,
      tag,
      value: String(value ?? ''),
      label,
      ...(key ? { key } : {}),
    });
  });

  if (fields.length === 0) return { ok: false, reason: 'no_form' };
  return { ok: true, formless: true, fields };
};

/**
 * @param {string} html
 * @param {Record<string, unknown>} profile
 * @param {string} letter
 */
export const planFormFillFromHtml = (html, profile, letter) => {
  const $ = cheerio.load(html);
  const form = $('form').first();
  if (!form.length) return { ok: false, reason: 'no_form' };

  const flat = normalizeFormProfile(profile);
  const action = form.attr('action') ?? '';
  const method = (form.attr('method') ?? 'get').toLowerCase();
  /** @type {{ name: string, type: string, tag: string, value: string }[]} */
  const fields = [];

  form.find('input, textarea, select').each((_, el) => {
    const tag = el.tagName?.toLowerCase() ?? 'input';
    const type = ($(el).attr('type') ?? 'text').toLowerCase();
    const name = $(el).attr('name');
    if (!name || type === 'hidden' || type === 'submit' || type === 'button') return;
    if (type === 'file') {
      fields.push({ name, type, tag, value: '' });
      return;
    }

    const label =
      $(el).attr('placeholder') ??
      $(el).attr('aria-label') ??
      form.find(`label[for="${$(el).attr('id')}"]`).text() ??
      name;

    let value = $(el).attr('value') ?? '';
    const key = matchFieldKey(label) ?? matchFieldKey(name);
    if (key) value = valueForFieldKey(flat, letter, key);
    if (tag === 'textarea' && !value && key === 'coverLetter') value = letter;
    if (tag === 'textarea' && !value) value = letter;

    fields.push({ name, type, tag, value: String(value ?? ''), label, ...(key ? { key } : {}) });
  });

  return { ok: true, action, method, fields };
};

/**
 * @param {import('playwright').Page} page
 * @param {{ fields: { name: string, type: string, tag: string, value: string }[] }} plan
 */
export const fillHtmlFormFromPlan = async (page, plan) => {
  /** @type {Record<string, string>} */
  const filled = {};

  for (const field of plan.fields) {
    if (field.type === 'file') continue;
    const selector = fieldNameSelector(field.name);
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;

    if (field.tag === 'select') {
      await locator.selectOption(field.value).catch(() => {});
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      if (field.value) await locator.check().catch(() => {});
    } else {
      await locator.fill(field.value).catch(() => {});
    }
    filled[field.name] = field.value;
  }

  return { filled };
};

/**
 * @param {import('playwright').Page} page
 * @param {{ fields: { selector: string, type: string, tag: string, value: string }[] }} plan
 */
export const fillFormlessFromPlan = async (page, plan) => {
  /** @type {Record<string, string>} */
  const filled = {};

  for (const field of plan.fields) {
    if (field.type === 'file') continue;
    const locator = page.locator(field.selector).first();
    if ((await locator.count()) === 0) continue;

    if (field.tag === 'select') {
      await locator.selectOption(field.value).catch(() => {});
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      if (field.value) await locator.check().catch(() => {});
    } else {
      await locator.fill(field.value).catch(() => {});
    }
    filled[field.selector] = field.value;
  }

  return { filled };
};

/**
 * @param {import('playwright').Page} page
 * @param {string} resumePath
 */
export const uploadHtmlFormResume = async (page, resumePath) => {
  const fileInput = page.locator('input[type="file"]:not([disabled])').first();
  if ((await fileInput.count()) === 0 || !existsSync(resumePath)) return false;
  await fileInput.setInputFiles(resumePath);
  return true;
};

/**
 * @param {import('playwright').Page} page
 * @param {{ fields: { name: string, type: string, tag: string, value: string }[] }} plan
 * @param {{ submit?: boolean, resumePath?: string, submitSelectors?: string[], formless?: boolean, waitFor?: string }} opts
 */
export const runHtmlFormFlow = async (page, plan, opts = {}) => {
  const { submit = false, resumePath = '', submitSelectors } = opts;
  const formless = opts.formless ?? plan.formless;

  if (formless) {
    if (opts.waitFor) {
      await page.waitForSelector(opts.waitFor, { timeout: 15_000 }).catch(() => {});
    }
  } else {
    await page.waitForSelector('form', { timeout: 15_000 });
  }

  const { filled } = formless
    ? await fillFormlessFromPlan(page, plan)
    : await fillHtmlFormFromPlan(page, plan);
  let resumeUploaded = false;
  if (resumePath) resumeUploaded = await uploadHtmlFormResume(page, resumePath);

  let submitted = false;
  if (submit) {
    const selector =
      submitSelectors?.length
        ? submitSelectors.join(', ')
        : 'button[type="submit"], input[type="submit"], [data-testid="html-submit"]';
    const submitBtn = page.locator(selector).first();
    if ((await submitBtn.count()) > 0) {
      await submitBtn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
      submitted = true;
    }
  }

  return { filled, resumeUploaded, submitted };
};

/**
 * @param {string} url
 */
export const loadFormHtml = async (url) => {
  if (/^file:\/\//i.test(url)) {
    const path = fileURLToPath(url);
    if (!existsSync(path)) throw new Error(`file not found: ${path}`);
    return readFileSync(path, 'utf8');
  }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 job-hub/1.0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

/**
 * @param {{ primaryUrl?: string, url?: string }} vacancy
 * @param {{ profile: Record<string, unknown>, letter: string }} ctx
 */
export const applyHtmlForm = async (vacancy, { profile, letter }) => {
  const url = vacancy.primaryUrl ?? vacancy.url;
  if (!url) return { ok: false, status: 'failed', error: 'no_url' };

  let html;
  try {
    html = await loadFormHtml(url);
  } catch (err) {
    return { ok: false, status: 'failed', error: err.message ?? String(err) };
  }

  const plan = planFormFillFromHtml(html, profile, letter);
  if (!plan.ok) {
    return { ok: false, status: 'needs_human', error: plan.reason ?? 'no_form', adapter: 'html-form' };
  }

  await enrichPlanWithAiAnswers(plan, vacancy, profile, letter);

  if (!config.playwrightEnabled) {
    return {
      ok: false,
      status: 'needs_human',
      error: 'PLAYWRIGHT_ENABLED=false — план заполнения готов, отправка вручную',
      adapter: 'html-form',
      plan,
    };
  }

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: config.playwrightHeadless });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const { resume_path: resumePath } = getMarketAssets(profile);
    // Незнакомую generic-форму не сабмитим вслепую — только заполняем (см. formSubmitGeneric).
    const submitGeneric = config.formSubmit && config.formSubmitGeneric;
    const result = await runHtmlFormFlow(page, plan, {
      submit: submitGeneric,
      resumePath,
    });

    await browser.close();

    if (result.submitted && submitGeneric) {
      return {
        ok: true,
        status: 'applied',
        adapter: 'html-form',
        note: `form submit ${url}`,
        plan,
        filled: result.filled,
      };
    }

    const filledCount = Object.keys(result.filled ?? {}).length;
    if (!submitGeneric && filledCount > 0) {
      const reason = !config.formSubmit ? 'FORM_SUBMIT=false' : 'FORM_SUBMIT_GENERIC=false (generic-форма не проверена)';
      return {
        ok: true,
        status: 'fill_only',
        adapter: 'html-form',
        note: `filled ${filledCount} fields (${reason})`,
        plan: { ...plan, filled: result.filled, resumeUploaded: result.resumeUploaded },
      };
    }

    return {
      ok: false,
      status: 'needs_human',
      error: submitGeneric
        ? 'HTML form: submit не сработал (капча или неизвестная разметка)'
        : 'форма не заполнена (разметка или капча)',
      adapter: 'html-form',
      plan: { ...plan, filled: result.filled, resumeUploaded: result.resumeUploaded },
    };
  } catch (err) {
    return {
      ok: false,
      status: 'needs_human',
      error: err.message ?? String(err),
      adapter: 'html-form',
      plan,
    };
  }
};
