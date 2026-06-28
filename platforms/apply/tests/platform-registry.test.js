import { describe, expect, it } from 'vitest';
import { careerPlatformId, isCareerPlatformUrl } from '../adapters/platforms/hosts.js';
import { resolvePlatformAdapter } from '../adapters/platforms/registry.js';

const CASES = [
  ['vk_careers', 'https://team.vk.company/vacancy/1'],
  ['rwb_careers', 'https://career.rwb.ru/vacancies/25895'],
  ['yandex_careers', 'https://yandex.ru/jobs/vacancies/123'],
  ['ozon_careers', 'https://job.ozon.ru/vacancy/frontend-1'],
  ['avito_careers', 'https://career.avito.com/vacancy/42'],
  ['sber_careers', 'https://rabota.sber.ru/search/123'],
  ['tbank_careers', 'https://team.tbank.ru/vacancy/1'],
  ['tbank_careers', 'https://tinkoff.ru/career/it/'],
  ['habr_career', 'https://career.habr.com/vacancies/123456'],
  ['djinni', 'https://djinni.co/jobs/12345-frontend/'],
  ['djinni', 'https://djinni.io/jobs/99/'],
  ['getmatch', 'https://getmatch.ru/vacancies/42'],
  ['hirehi', 'https://hirehi.ru/vacancy/frontend'],
  ['jobrockets', 'https://jobrockets.ru/job/abc'],
];

describe('career platform hosts', () => {
  it.each(CASES)('maps %s ← %s', (id, url) => {
    expect(careerPlatformId(url)).toBe(id);
    expect(isCareerPlatformUrl(url)).toBe(true);
  });

  it('returns null for unrelated URLs', () => {
    expect(careerPlatformId('https://forms.gle/abc')).toBeNull();
    expect(isCareerPlatformUrl(null)).toBe(false);
  });
});

describe('resolvePlatformAdapter', () => {
  it('returns adapter with id for known career URL', () => {
    const a = resolvePlatformAdapter('https://djinni.co/jobs/1/');
    expect(a?.id).toBe('djinni');
    expect(typeof a?.apply).toBe('function');
  });

  it('returns null for unknown URL', () => {
    expect(resolvePlatformAdapter('https://example.com/jobs')).toBeNull();
  });
});
