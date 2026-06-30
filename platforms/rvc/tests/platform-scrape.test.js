import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlatformHtml } from '../adapters/platform-scrape.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('platform scrape boundary', () => {
  it('extracts hirehi vacancy links from fixture', () => {
    const html = readFileSync(join(__dirname, '..', 'fixtures', 'hirehi-listing.html'), 'utf8');
    const items = parsePlatformHtml(html, {
      id: 'hirehi',
      url: 'https://hirehi.ru',
      search_url: 'https://hirehi.ru/vacancies',
    });
    expect(items).toHaveLength(2);
    expect(items[0].url).toMatch(/hirehi\.ru\/vacancies\//);
    expect(items[0].route).toBe('form');
  });
});
