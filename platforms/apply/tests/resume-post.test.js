import { describe, expect, it } from 'vitest';
import { isCandidateResumePost } from '../lib/resume-post.js';

describe('isCandidateResumePost', () => {
  it('detects #резюме posts', () => {
    expect(
      isCandidateResumePost('#резюме Frontend React\nПишите на hr@test.com'),
    ).toBe(true);
  });

  it('detects resume seeking without vacancy signals', () => {
    expect(isCandidateResumePost('Ищу работу frontend, пишите в лс')).toBe(true);
  });

  it('does not flag vacancy with apply email', () => {
    expect(
      isCandidateResumePost(
        'Вакансия Frontend. Отклик: team@company.com\nReact TypeScript',
      ),
    ).toBe(false);
  });

  it('does not flag posts with career job URLs', () => {
    expect(
      isCandidateResumePost(
        'Frontend https://djinni.co/jobs/12345/ contact@x.com',
      ),
    ).toBe(false);
  });
});
