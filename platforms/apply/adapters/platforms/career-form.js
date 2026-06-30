import { config } from '../../lib/config.js';
import { getMarketAssets } from '../../lib/profile.js';
import { enrichPlanWithAiAnswers } from '../../lib/ai-screening.js';
import { loadSessionState } from '../../lib/session.js';
import {
  planFormFillFromHtml,
  planFormFillFormlessFromHtml,
  runHtmlFormFlow,
} from '../forms/html-form.js';
import { applyHtmlForm } from '../forms/html-form.js';
import { platformSpec } from './specs.js';

/**
 * @param {import('playwright').Page} page
 * @param {{ applyButtonSelectors?: string[], waitFor?: string }} spec
 */
export const openCareerApplyForm = async (page, spec) => {
  for (const sel of spec.applyButtonSelectors ?? []) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    await loc.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    break;
  }
  if (spec.waitFor) {
    await page.waitForSelector(spec.waitFor, { timeout: 15_000 }).catch(() => {});
  }
};

/**
 * @param {{ primaryUrl?: string, url?: string }} vacancy
 * @param {{ profile: Record<string, unknown>, letter: string }} ctx
 * @param {string} platformId
 */
export const applyCareerForm = async (vacancy, ctx, platformId) => {
  const spec = platformSpec(platformId);
  if (!spec) return applyHtmlForm(vacancy, ctx);

  const url = vacancy.primaryUrl ?? vacancy.url;
  if (!url) return { ok: false, status: 'failed', error: 'no_url' };

  if (!config.playwrightEnabled) {
    return {
      ok: false,
      status: 'needs_human',
      error: 'PLAYWRIGHT_ENABLED=false — career site требует Playwright',
      adapter: platformId,
    };
  }

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: config.playwrightHeadless,
      args: spec.browserArgs ?? [],
    });
    const storageState = loadSessionState(platformId);
    const context = await browser.newContext({
      locale: 'ru-RU',
      ...(spec.browserUserAgent ? { userAgent: spec.browserUserAgent } : {}),
      ...(storageState ? { storageState } : {}),
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (spec.pageSettleMs) await page.waitForTimeout(spec.pageSettleMs);

    await openCareerApplyForm(page, spec);

    const html = await page.content();
    const plan = spec.formless
      ? planFormFillFormlessFromHtml(html, ctx.profile, ctx.letter)
      : planFormFillFromHtml(html, ctx.profile, ctx.letter);
    if (!plan.ok) {
      await browser.close();
      return {
        ok: false,
        status: 'needs_human',
        error: plan.reason ?? 'no_form',
        adapter: platformId,
      };
    }

    await enrichPlanWithAiAnswers(plan, vacancy, ctx.profile, ctx.letter);

    const { resume_path: resumePath } = getMarketAssets(ctx.profile);
    const shouldSubmit = config.formSubmit && (spec.allowAutoSubmit ?? false);
    const result = await runHtmlFormFlow(page, plan, {
      submit: shouldSubmit,
      resumePath,
      submitSelectors: spec.submitSelectors,
      formless: spec.formless,
      waitFor: spec.waitFor,
    });

    await browser.close();

    if (result.submitted && shouldSubmit) {
      const aiFields = plan.fields.filter((f) => f.aiGenerated).map((f) => f.label ?? f.name ?? f.selector);
      return {
        ok: true,
        status: 'applied',
        adapter: platformId,
        note: JSON.stringify({ url, aiFields }),
        plan,
        filled: result.filled,
      };
    }

    const filledCount = Object.keys(result.filled ?? {}).length;
    if (!shouldSubmit && filledCount > 0) {
      const reason = !config.formSubmit
        ? 'FORM_SUBMIT=false'
        : `${platformId}: allowAutoSubmit=false (нужна headed-проверка)`;
      return {
        ok: true,
        status: 'fill_only',
        adapter: platformId,
        note: `filled ${filledCount} fields (${reason})`,
        plan: { ...plan, filled: result.filled, resumeUploaded: result.resumeUploaded },
      };
    }

    return {
      ok: false,
      status: 'needs_human',
      error: shouldSubmit
        ? `${platformId}: submit не сработал (капча или разметка)`
        : 'форма не заполнена (разметка или капча)',
      adapter: platformId,
      plan: { ...plan, filled: result.filled, resumeUploaded: result.resumeUploaded },
    };
  } catch (err) {
    return {
      ok: false,
      status: 'needs_human',
      error: err.message ?? String(err),
      adapter: platformId,
    };
  }
};
