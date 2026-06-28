import { describe, expect, it } from 'vitest';
import { extractContacts } from '../lib/tg-contacts.js';

describe('extractContacts job_url', () => {
  it('recognizes team.vk.company vacancy links', () => {
    const contacts = extractContacts(
      'Frontend https://team.vk.company/vacancy/12345-frontend-developer',
    );
    const jobs = contacts.filter((c) => c.kind === 'job_url');
    expect(jobs.some((j) => j.value.includes('team.vk.company'))).toBe(true);
  });

  it('recognizes bare team.vk.company URLs', () => {
    const contacts = extractContacts('Ссылка team.vk.company/vacancy/99');
    const jobs = contacts.filter((c) => c.kind === 'job_url');
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs[0].value).toMatch(/team\.vk\.company\/vacancy\/99/);
  });
});
