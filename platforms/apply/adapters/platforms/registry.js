import { applyCareerForm } from './career-form.js';
import { careerPlatformId } from './hosts.js';

/**
 * @param {string | null | undefined} url
 * @returns {{ id: string, apply: typeof applyCareerForm } | null}
 */
export const resolvePlatformAdapter = (url) => {
  const id = careerPlatformId(url);
  if (!id) return null;
  return {
    id,
    apply: (vacancy, ctx) => applyCareerForm(vacancy, ctx, id),
  };
};
