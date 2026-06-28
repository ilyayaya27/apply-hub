import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendExternalSkip, getExternalFeedPath } from '../lib/external-feed.js';

describe('external-feed', () => {
  let tmpDir;
  let feedPath;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-hub-feed-'));
    feedPath = join(tmpDir, 'skips.jsonl');
    process.env.EXTERNAL_FEED_PATH = feedPath;
  });

  afterEach(() => {
    delete process.env.EXTERNAL_FEED_PATH;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends JSONL row', () => {
    appendExternalSkip({
      route: 'hh',
      primaryUrl: 'https://hh.ru/vacancy/1',
      postUrl: 'https://t.me/x/1',
      sourceId: 'telegram:x',
      postId: '1',
    });
    const line = readFileSync(feedPath, 'utf8').trim();
    const parsed = JSON.parse(line);
    expect(parsed.route).toBe('hh');
    expect(parsed.primaryUrl).toContain('hh.ru');
    expect(getExternalFeedPath()).toBe(feedPath);
  });
});
