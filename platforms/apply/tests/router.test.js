import { describe, expect, it } from 'vitest';
import { classifyApplyRoute } from '../lib/router.js';

describe('classifyApplyRoute', () => {
  it('routes hh to skip external', () => {
    const r = classifyApplyRoute({
      text: 'Frontend https://hh.ru/vacancy/123',
      links: ['https://hh.ru/vacancy/123'],
    });
    expect(r.route).toBe('hh');
  });

  it('routes bare hh.ru URL without scheme', () => {
    const r = classifyApplyRoute({
      text: 'Vacancy hh.ru/vacancy/456 apply',
      links: [],
    });
    expect(r.route).toBe('hh');
    expect(r.primaryUrl).toMatch(/hh\.ru\/vacancy\/456/);
  });

  it('routes linkedin to skip external', () => {
    const r = classifyApplyRoute({
      text: 'Job https://www.linkedin.com/jobs/view/1',
      links: ['https://www.linkedin.com/jobs/view/1'],
    });
    expect(r.route).toBe('linkedin');
  });

  it('routes bare linkedin.com URL without scheme', () => {
    const r = classifyApplyRoute({
      text: 'See linkedin.com/jobs/view/99 for details',
      links: [],
    });
    expect(r.route).toBe('linkedin');
    expect(r.primaryUrl).toMatch(/linkedin\.com\/jobs/);
  });

  it('routes google form to form', () => {
    const r = classifyApplyRoute({
      text: 'Apply https://forms.gle/abc123',
      links: ['https://forms.gle/abc123'],
    });
    expect(r.route).toBe('form');
  });

  it('routes email in text', () => {
    const r = classifyApplyRoute({
      text: 'Send CV to hr@company.com',
      links: [],
    });
    expect(r.route).toBe('email');
    expect(r.primaryUrl).toMatch(/@/);
  });

  it('falls back to manual for djinni', () => {
    const r = classifyApplyRoute({
      text: 'https://djinni.co/jobs/12345-frontend/',
      links: ['https://djinni.co/jobs/12345-frontend/'],
    });
    expect(r.route).toBe('manual');
  });

  it('routes VK Careers to form', () => {
    const r = classifyApplyRoute({
      text: 'VK https://team.vk.company/vacancy/123-frontend',
      links: ['https://team.vk.company/vacancy/123-frontend'],
    });
    expect(r.route).toBe('form');
    expect(r.primaryUrl).toMatch(/team\.vk\.company/);
  });

  it('routes career.habr.com to form', () => {
    const r = classifyApplyRoute({
      text: 'https://career.habr.com/vacancies/123456',
      links: ['https://career.habr.com/vacancies/123456'],
    });
    expect(r.route).toBe('form');
  });
});
