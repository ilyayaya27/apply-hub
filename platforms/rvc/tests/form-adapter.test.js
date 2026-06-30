import { describe, expect, it } from 'vitest';
import { detectFormAdapterId, isGoogleFormsUrl } from '../adapters/forms/detect.js';
import { matchFieldKey, valueForFieldKey } from '../lib/form-field-hints.js';

describe('detectFormAdapterId', () => {
  it('detects Google Forms short links', () => {
    expect(detectFormAdapterId('https://forms.gle/abc123')).toBe('google-forms');
  });

  it('detects Google Forms docs URLs', () => {
    expect(detectFormAdapterId('https://docs.google.com/forms/d/e/1FAIpQL/viewform')).toBe(
      'google-forms',
    );
  });

  it('detects generic HTML form URLs', () => {
    expect(detectFormAdapterId('https://company.com/careers/apply')).toBe('html-form');
  });

  it('detects local file:// HTML fixtures', () => {
    expect(detectFormAdapterId('file:///tmp/simple-form.html')).toBe('html-form');
  });

  it('routes google-form-mock fixture to google-forms adapter', () => {
    expect(
      detectFormAdapterId('file:///home/alice/Documents/rvc-applicant/fixtures/google-form-mock.html'),
    ).toBe('google-forms');
  });

  it('returns null for empty', () => {
    expect(detectFormAdapterId('')).toBeNull();
    expect(detectFormAdapterId(null)).toBeNull();
  });
});

describe('isGoogleFormsUrl', () => {
  it('is true only for google forms hosts', () => {
    expect(isGoogleFormsUrl('https://forms.gle/x')).toBe(true);
    expect(isGoogleFormsUrl('https://example.com/form')).toBe(false);
  });
});

describe('matchFieldKey', () => {
  it('maps common labels', () => {
    expect(matchFieldKey('Your email address')).toBe('email');
    expect(matchFieldKey('Telegram username')).toBe('telegram');
    expect(matchFieldKey('Сопроводительное письмо')).toBe('coverLetter');
  });
});

describe('valueForFieldKey', () => {
  it('returns profile values', () => {
    const profile = { name: 'Alice', email: 'a@b.c', telegram: '@alice' };
    expect(valueForFieldKey(profile, 'Hi', 'name')).toBe('Alice');
    expect(valueForFieldKey(profile, 'Hi', 'coverLetter')).toBe('Hi');
  });
});
