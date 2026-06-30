import { describe, expect, it } from 'vitest';
import { extractContacts, normalizeJobUrl, contactLinkValues } from '../lib/tg-contacts.js';

describe('tg-contacts', () => {
  it('extracts @handles, t.me links, emails, and job board URLs', () => {
    const text = `
      HR @recruiter_bot
      https://t.me/revacancy_bot?start=v_abc
      mail@test.com
      https://hh.ru/vacancy/123?utm_source=tg
    `;
    const contacts = extractContacts(text);
    expect(contacts.some((c) => c.value === 'https://t.me/recruiter_bot')).toBe(true);
    expect(contacts.some((c) => c.value === 'https://t.me/revacancy_bot')).toBe(true);
    expect(contacts.some((c) => c.kind === 'email' && c.value === 'mail@test.com')).toBe(true);
    expect(contacts.some((c) => c.kind === 'job_url' && c.value.includes('hh.ru/vacancy/123'))).toBe(
      true,
    );
  });

  it('strips utm params from job URLs', () => {
    expect(normalizeJobUrl('https://HH.ru/vacancy/1?utm_source=tg')).toBe(
      'https://hh.ru/vacancy/1',
    );
  });

  it('contactLinkValues returns canonical link strings', () => {
    const values = contactLinkValues('Contact @job_bot for https://djinni.co/jobs/123');
    expect(values).toContain('https://t.me/job_bot');
    expect(values.some((v) => v.includes('djinni.co'))).toBe(true);
  });
});
