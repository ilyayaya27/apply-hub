import { applyHtmlForm } from '../forms/html-form.js';
import { careerPlatformId } from './hosts.js';

/**
 * @param {string | null | undefined} url
 * @returns {{ id: string, apply: typeof applyHtmlForm } | null}
 */
export const resolvePlatformAdapter = (url) => {
  const id = careerPlatformId(url);
  if (!id) return null;
  return {
    id,
    apply: (vacancy, ctx) => applyHtmlForm(vacancy, ctx),
  };
};
