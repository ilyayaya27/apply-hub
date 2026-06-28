import { describe, expect, it } from 'vitest';
import { isVkCareersUrl } from '../adapters/platforms/vk-careers.js';

describe('vk-careers adapter', () => {
  it('detects team.vk.company URLs', () => {
    expect(isVkCareersUrl('https://team.vk.company/vacancy/1')).toBe(true);
    expect(isVkCareersUrl('https://forms.gle/abc')).toBe(false);
  });
});
