/** SSOT: career sites → route `form` + platform adapter (Playwright html-form). */

/** @type {{ id: string, pattern: RegExp }[]} */
export const CAREER_PLATFORMS = [
  { id: 'vk_careers', pattern: /team\.vk\.company/i },
  { id: 'habr_career', pattern: /career\.habr\.com/i },
  { id: 'djinni', pattern: /djinni\.(?:co|io)/i },
  { id: 'getmatch', pattern: /getmatch\.ru/i },
  { id: 'hirehi', pattern: /hirehi\.ru/i },
  { id: 'jobrockets', pattern: /jobrockets\.ru/i },
];

/** @param {string | null | undefined} url */
export const careerPlatformId = (url) => {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  return CAREER_PLATFORMS.find((p) => p.pattern.test(u))?.id ?? null;
};

/** @param {string | null | undefined} url */
export const isCareerPlatformUrl = (url) => careerPlatformId(url) != null;

export const careerHostPatterns = () => CAREER_PLATFORMS.map((p) => p.pattern);
