import { detectFormAdapterId } from '../adapters/forms/detect.js';
import { resolveApplyUrl } from '../lib/fixture-url.js';
import { applyGoogleForm } from '../adapters/forms/google-forms.js';
import { applyHtmlForm } from '../adapters/forms/html-form.js';
import { resolvePlatformAdapter } from '../adapters/platforms/registry.js';
import { getMarketAssets, loadProfile } from '../lib/profile.js';
import { loadCoverLetter } from '../lib/letter.js';

/**
 * @param {{ primaryUrl?: string, url?: string, title?: string, company?: string }} vacancy
 * @param {{ profile: Record<string, unknown>, letter?: string }} [ctx]
 */
export const applyViaForm = async (vacancy, ctx = {}) => {
  const rawUrl = vacancy.primaryUrl ?? vacancy.url;
  const url = resolveApplyUrl(rawUrl);
  const vacancyResolved = { ...vacancy, primaryUrl: url, url };

  const profile = ctx.profile ?? loadProfile();
  const letter = ctx.letter ?? loadCoverLetter();

  const platform = resolvePlatformAdapter(url);
  if (platform) {
    return platform.apply(vacancyResolved, { profile, letter });
  }

  const adapter = detectFormAdapterId(url);
  if (!adapter) {
    return { ok: false, status: 'needs_human', error: 'unknown_form_url', url };
  }

  if (adapter === 'google-forms') {
    return applyGoogleForm(vacancyResolved, { profile, letter });
  }

  return applyHtmlForm(vacancyResolved, { profile, letter });
};

/** @deprecated use planFormFillFromHtml from adapters/forms/html-form.js */
export { planFormFillFromHtml as planFormFill } from '../adapters/forms/html-form.js';

export { getMarketAssets };
