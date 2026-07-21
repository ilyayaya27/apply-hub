import { describe, expect, it } from 'vitest';
import { PLATFORM_SPECS, platformSpec } from '../adapters/platforms/specs.js';
import { resolvePlatformAdapter } from '../adapters/platforms/registry.js';

describe('career platform specs', () => {
  it('has specs for all career platforms', () => {
    const ids = [
      'vk_careers',
      'habr_career',
      'djinni',
      'getmatch',
      'hirehi',
      // jobrockets removed — DNS dead (NXDOMAIN), deprecated in sources.yaml
    ];
    for (const id of ids) {
      expect(platformSpec(id)?.applyButtonSelectors?.length).toBeGreaterThan(0);
    }
  });

  it('registry resolves djinni to career-form adapter id', () => {
    const adapter = resolvePlatformAdapter('https://djinni.co/jobs/12345-frontend/');
    expect(adapter?.id).toBe('djinni');
    expect(adapter?.apply).toBeTypeOf('function');
  });
});

describe('PLATFORM_SPECS shape', () => {
  it('each spec has waitFor and submitSelectors', () => {
    for (const spec of Object.values(PLATFORM_SPECS)) {
      expect(spec.waitFor).toBeTruthy();
      expect(spec.submitSelectors?.length).toBeGreaterThan(0);
    }
  });
});
