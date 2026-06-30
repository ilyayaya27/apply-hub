import * as cheerio from 'cheerio';
import { readFileSync } from 'node:fs';
import { classifyApplyRoute } from '../lib/router.js';
import { parseVacancyText } from '../lib/parse.js';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** @type {Record<string, { host: RegExp, path: RegExp }>} */
const PLATFORM_LINK_RULES = {
  hirehi: { host: /hirehi\.ru/i, path: /\/vacancies\/[\w-]+/i },
  habr: { host: /habr\.com|career\.habr/i, path: /\/vacancies\/\d+/i },
  getmatch: { host: /getmatch\.ru/i, path: /\/vacancies\/[\w-]+/i },
  vk: { host: /team\.vk\.company|vk\.company/i, path: /\/vacancy\/\d+/i },
};

const absoluteUrl = (base, href) => {
  try {
    return new URL(href, base).href.split('#')[0];
  } catch {
    return null;
  }
};

/**
 * @param {string} html
 * @param {{ id: string, url?: string, search_url?: string }} source
 */
export function parsePlatformHtml(html, source) {
  const rule = PLATFORM_LINK_RULES[source.id];
  if (!rule) return [];

  const base = source.search_url ?? source.url ?? 'https://example.com';
  const $ = cheerio.load(html);
  const seen = new Set();
  const items = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const abs = absoluteUrl(base, href);
    if (!abs || !rule.host.test(abs) || !rule.path.test(abs)) return;
    if (seen.has(abs)) return;
    seen.add(abs);

    const title = $(el).text().replace(/\s+/g, ' ').trim() || 'Vacancy';
    const cardText = $(el).closest('article, li, div').text().replace(/\s+/g, ' ').trim();
    const parsed = parseVacancyText(cardText || title);
    const route = classifyApplyRoute({ text: cardText || title, links: [abs] });

    items.push({
      externalId: abs.replace(/\/$/, '').split('/').pop() ?? abs,
      url: abs,
      platformUrl: abs,
      title: parsed.title || title,
      rawText: parsed.rawText || cardText || title,
      skills: parsed.skills,
      tags: parsed.tags,
      remote: parsed.remote,
      tier: parsed.tier,
      seniority: parsed.seniority,
      languages: parsed.languages,
      route: route.route === 'manual' ? 'form' : route.route,
      primaryUrl: abs,
      hints: route.hints,
    });
  });

  return items;
}

export async function fetchPlatformHtml(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

/**
 * @param {{ id: string, search_url?: string, url?: string }} source
 * @param {{ fixturePath?: string }} opts
 */
export async function scrapePlatformListings(source, opts = {}) {
  const html = opts.fixturePath
    ? readFileSync(opts.fixturePath, 'utf8')
    : await fetchPlatformHtml(source.search_url ?? source.url);
  return parsePlatformHtml(html, source);
}
