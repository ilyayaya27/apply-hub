import { describe, expect, it, beforeEach } from 'vitest';
import { loadSources, getEnabledPlatforms, getSourceById, clearSourcesCache } from '../lib/sources.js';

describe('sources.yaml registry', () => {
  beforeEach(() => clearSourcesCache());

  it('loads platform entries including vk_careers', () => {
    const sources = loadSources();
    expect(sources.length).toBeGreaterThan(0);
    const vk = getSourceById('vk_careers');
    expect(vk?.type).toBe('platform');
    expect(vk?.automation_tier).toBe('apply_auto');
  });

  it('lists apply_auto platforms for dispatcher cycles', () => {
    const auto = getEnabledPlatforms();
    const ids = auto.map((s) => s.id);
    expect(ids).toContain('vk_careers');
    expect(ids).toContain('habr_career');
    expect(ids).toContain('djinni');
    expect(ids).toContain('getmatch');
    expect(ids).toContain('hirehi');
    expect(ids).toContain('jobrockets');
    expect(ids).not.toContain('hh');
  });
});
