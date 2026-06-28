import { describe, expect, it } from 'vitest';
import { CAREER_SMOKE_PROBES } from '../lib/career-smoke-probes.js';
import { careerPlatformId } from '../adapters/platforms/hosts.js';

describe('career-smoke probes', () => {
  it('each probe URL maps to declared platformId', () => {
    for (const probe of CAREER_SMOKE_PROBES) {
      expect(careerPlatformId(probe.url)).toBe(probe.platformId);
    }
  });
});
