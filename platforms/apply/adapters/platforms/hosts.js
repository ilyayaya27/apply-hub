/** SSOT: career sites → route `form` + platform adapter (Playwright html-form). */

/** @type {{ id: string, pattern: RegExp }[]} */
export const CAREER_PLATFORMS = [
  { id: 'vk_careers', pattern: /(?:team|internship)\.vk\.company/i },
  { id: 'rwb_careers', pattern: /career\.rwb\.ru/i },
  { id: 'yandex_careers', pattern: /yandex\.(?:ru|com)\/jobs/i },
  /** IT/office — career.ozon.ru; job.ozon.ru = Ozon Job (склад/курьер), не auto-apply */
  { id: 'ozon_careers', pattern: /career\.ozon\.ru/i },
  { id: 'avito_careers', pattern: /career\.avito\.com/i },
  { id: 'sber_careers', pattern: /rabota\.sber\.ru/i },
  { id: 'tbank_careers', pattern: /(?:team\.)?tbank\.ru/i },
  { id: 'tbank_careers', pattern: /tinkoff\.ru\/career/i },
  { id: 'habr_career', pattern: /career\.habr\.com/i },
  { id: 'djinni', pattern: /djinni\.(?:co|io)/i },
  { id: 'getmatch', pattern: /getmatch\.ru/i },
  { id: 'hirehi', pattern: /hirehi\.ru/i },
  { id: 'jobrockets', pattern: /jobrockets\.ru/i },
  { id: 'beeline_careers', pattern: /job\.beeline\.ru/i },
  { id: 'moysklad_careers', pattern: /moysklad\.ru\/company\/careers/i },
  { id: 'alfabank_careers', pattern: /job\.alfabank\.ru/i },
  { id: 'cloudru_careers', pattern: /cloud\.ru\/career/i },
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
