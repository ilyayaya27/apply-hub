import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetDbForTests } from '../lib/db.js';
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

describe('skip external routes', () => {
  let tmpDir;
  let feedPath;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-hub-skip-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    process.env.JOB_HUB_SKIP_STATE_MIGRATE = '1';
    feedPath = join(tmpDir, 'external-skips.jsonl');
    process.env.EXTERNAL_FEED_PATH = feedPath;
    resetDbForTests();
  });

  afterEach(() => {
    resetDbForTests();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    delete process.env.JOB_HUB_SKIP_STATE_MIGRATE;
    delete process.env.EXTERNAL_FEED_PATH;
  });

  it('hh never would_apply', () => {
    const out = enqueueFromHarvestPost({
      sourceId: 'telegram:x',
      postId: '1',
      postUrl: 'https://t.me/x/1',
      rawText: 'https://hh.ru/vacancy/1',
      links: ['https://hh.ru/vacancy/1'],
    });
    expect(out.results[0].action).toBe('skip_external');
    expect(out.results[0].route).toBe('hh');
    const feed = readFileSync(feedPath, 'utf8').trim();
    expect(JSON.parse(feed).route).toBe('hh');
  });

  it('linkedin never would_apply', () => {
    const out = enqueueFromHarvestPost({
      sourceId: 'telegram:x',
      postId: '2',
      postUrl: 'https://t.me/x/2',
      rawText: 'https://www.linkedin.com/jobs/view/123',
      links: ['https://www.linkedin.com/jobs/view/123'],
    });
    expect(out.results[0].action).toBe('skip_external');
    expect(out.results[0].route).toBe('linkedin');
    const feed = JSON.parse(readFileSync(feedPath, 'utf8').trim());
    expect(feed.route).toBe('linkedin');
  });
});
