import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  planFormFillFromHtml,
  runHtmlFormFlow,
} from '../adapters/forms/html-form.js';
import { config } from '../lib/config.js';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const MOCK_PATH = join(ROOT, 'fixtures', 'simple-form.html');
const MOCK_URL = `file://${MOCK_PATH}`;

const profile = {
  contact: { email: 'html@test.example', telegram: '@html_user' },
};

const letter = 'HTML integration cover letter';

const playwrightAvailable = async () => {
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
};

const hasPlaywright = await playwrightAvailable();

describe('html-form adapter (Playwright)', () => {
  it.skipIf(!hasPlaywright)(
    'fills mock HTML form from plan without submit',
    async () => {
      const html = readFileSync(MOCK_PATH, 'utf8');
      const plan = planFormFillFromHtml(html, profile, letter);
      expect(plan.ok).toBe(true);

      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(MOCK_URL, { waitUntil: 'domcontentloaded' });

      const result = await runHtmlFormFlow(page, plan, { submit: false });
      expect(result.filled.applicant_name).toBe(config.applyName);
      expect(result.filled.email).toBe('html@test.example');
      expect(result.filled.telegram).toBe('html_user');
      expect(result.filled.cover_letter).toBe(letter);
      expect(result.submitted).toBe(false);

      const submitted = await page.evaluate(() => document.body.dataset.submitted);
      expect(submitted).toBeUndefined();

      await browser.close();
    },
    60_000,
  );

  it.skipIf(!hasPlaywright)(
    'submit flow sets submitted flag on mock',
    async () => {
      const html = readFileSync(MOCK_PATH, 'utf8');
      const plan = planFormFillFromHtml(html, profile, letter);

      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(MOCK_URL, { waitUntil: 'domcontentloaded' });

      const result = await runHtmlFormFlow(page, plan, { submit: true });
      expect(result.submitted).toBe(true);
      const submitted = await page.evaluate(() => document.body.dataset.submitted);
      expect(submitted).toBe('true');

      await browser.close();
    },
    60_000,
  );
});

describe('simple-form fixture', () => {
  it('loads fixture HTML', () => {
    const html = readFileSync(MOCK_PATH, 'utf8');
    expect(html).toContain('data-testid="html-submit"');
    expect(html).toContain('dataset.submitted');
  });
});
