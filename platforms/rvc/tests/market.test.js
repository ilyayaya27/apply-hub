import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadProfile,
  clearProfileCache,
  getActiveMarket,
  getMarketAssets,
} from '../lib/profile.js';
import {
  getEnabledTelegramChannels,
  getEnabledPlatforms,
  clearSourcesCache,
} from '../lib/sources.js';

describe('active market (RU focus)', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'job-hub-market-'));
    clearProfileCache();
    clearSourcesCache();
    delete process.env.JOB_HUB_ACTIVE_MARKET;
  });

  afterEach(() => {
    clearProfileCache();
    clearSourcesCache();
    delete process.env.JOB_HUB_ACTIVE_MARKET;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('getActiveMarket prefers env over profile', () => {
    writeFileSync(
      join(tmpRoot, 'profile.yaml'),
      `active_market: global
role: Dev
keywords:
  - react
exclude_patterns: []
markets:
  - ru_remote
min_fit_score: 55
market_assets:
  ru:
    cover_letter_path: /tmp/ru-letter.txt
  global:
    cover_letter_path: /tmp/en-letter.txt
contact:
  telegram: "@test"
`,
    );
    process.env.JOB_HUB_ACTIVE_MARKET = 'ru';
    const profile = loadProfile(tmpRoot);
    expect(getActiveMarket(profile)).toBe('ru');
  });

  it('getMarketAssets returns RU letter and hh resume id from market_assets', () => {
    writeFileSync(
      join(tmpRoot, 'profile.yaml'),
      `active_market: ru
role: Frontend Developer
keywords:
  - react
exclude_patterns: []
markets:
  - ru_remote
min_fit_score: 55
market_assets:
  ru:
    cover_letter_path: /data/ru-letter.txt
    resume_path: /data/ru-resume.pdf
    hh_resume_id: abc123
contact:
  telegram: "@test"
`,
    );
    const assets = getMarketAssets(loadProfile(tmpRoot));
    expect(assets.market).toBe('ru');
    expect(assets.cover_letter_path).toBe('/data/ru-letter.txt');
    expect(assets.resume_path).toBe('/data/ru-resume.pdf');
    expect(assets.hh_resume_id).toBe('abc123');
  });

  it('getEnabledTelegramChannels excludes global market when active_market=ru', () => {
    writeFileSync(
      join(tmpRoot, 'profile.yaml'),
      `active_market: ru
role: Dev
keywords:
  - react
exclude_patterns: []
markets:
  - ru_remote
min_fit_score: 55
contact:
  telegram: "@test"
`,
    );
    writeFileSync(
      join(tmpRoot, 'sources.yaml'),
      `sources:
  - id: ru_ch
    type: telegram_channel
    preview: revacancy
    market: ru
    enabled: true
    priority: 1
  - id: global_ch
    type: telegram_channel
    preview: revacancy_global
    market: global
    enabled: true
    priority: 1
`,
    );
    const channels = getEnabledTelegramChannels(tmpRoot);
    expect(channels.map((c) => c.id)).toEqual(['ru_ch']);
  });

  it('getEnabledPlatforms respects active market', () => {
    writeFileSync(
      join(tmpRoot, 'profile.yaml'),
      `active_market: ru
role: Dev
keywords:
  - react
exclude_patterns: []
markets:
  - ru_remote
min_fit_score: 55
contact:
  telegram: "@test"
`,
    );
    writeFileSync(
      join(tmpRoot, 'sources.yaml'),
      `sources:
  - id: habr
    type: platform
    url: https://career.habr.com
    market: ru
    automation_tier: apply_auto
    enabled: true
  - id: jobleads
    type: platform
    url: https://www.jobleads.com
    market: global
    automation_tier: apply_auto
    enabled: true
`,
    );
    const platforms = getEnabledPlatforms(tmpRoot);
    expect(platforms.map((p) => p.id)).toEqual(['habr']);
  });
});
