import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fillGoogleFormPage, runGoogleFormFlow } from '../adapters/forms/google-forms.js';
import { config } from '../lib/config.js';

const ROOT = join(fileURLToPath(new URL('..', import.meta.url)));
const MOCK_PATH = join(ROOT, 'fixtures', 'google-form-mock.html');
const MOCK_URL = `file://${MOCK_PATH}`;

const profile = {
  contact: { email: 'test@example.com', telegram: '@gform_user' },
};

const letter = 'Integration test cover letter';

const playwrightAvailable = async () => {
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
};

const hasPlaywright = await playwrightAvailable();

describe('google-forms adapter (Playwright)', () => {
  it.skipIf(!hasPlaywright)(
    'fills mock Google Form fields without submit',
    async () => {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(MOCK_URL, { waitUntil: 'domcontentloaded' });

      const { filled } = await fillGoogleFormPage(page, profile, letter);
      expect(filled['Full name']).toBe(config.applyName);
      expect(filled['Email address']).toBe('test@example.com');
      expect(filled.Telegram).toBe('gform_user');
      expect(filled['Cover letter']).toBe(letter);

      await browser.close();
    },
    60_000,
  );

  it.skipIf(!hasPlaywright)(
    'dry-run flow does not set submitted flag',
    async () => {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(MOCK_URL, { waitUntil: 'domcontentloaded' });

      const result = await runGoogleFormFlow(page, profile, letter, { submit: false });
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
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(MOCK_URL, { waitUntil: 'domcontentloaded' });

      const result = await runGoogleFormFlow(page, profile, letter, { submit: true });
      expect(result.submitted).toBe(true);
      const submitted = await page.evaluate(() => document.body.dataset.submitted);
      expect(submitted).toBe('true');

      await browser.close();
    },
    60_000,
  );
});

describe('google-form mock fixture', () => {
  it('loads fixture HTML', () => {
    const html = readFileSync(MOCK_PATH, 'utf8');
    expect(html).toContain('role="listitem"');
    expect(html).toContain('data-testid="g-submit"');
  });
});
