import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetDbForTests } from '../lib/db.js';
import { getDb } from '../lib/db.js';
import { enqueue } from '../lib/store.js';
import { getFunnelMetrics, getPlatformMetrics } from '../lib/metrics.js';

describe('metrics', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-metrics-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    process.env.JOB_HUB_SKIP_STATE_MIGRATE = '1';
    resetDbForTests();
  });

  afterEach(() => {
    resetDbForTests();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    delete process.env.JOB_HUB_SKIP_STATE_MIGRATE;
  });

  it('aggregates funnel and platform breakdown', () => {
    enqueue({
      key: 'k1',
      channel: 'tg',
      source: 'tg',
      postId: '1',
      fitScore: 80,
      route: 'form',
      title: 'Frontend',
      url: 'https://djinni.co/jobs/1/',
      primaryUrl: 'https://djinni.co/jobs/1/',
    });
    enqueue({
      key: 'k2',
      channel: 'tg',
      source: 'tg',
      postId: '2',
      fitScore: 70,
      route: 'email',
      title: 'HR',
      url: 'https://example.com',
      primaryUrl: 'hr@test.com',
    });

    const db = getDb(process.env.JOB_HUB_DB);
    db.prepare(`UPDATE vacancies SET status = 'applied' WHERE id = 'k1'`).run();

    const funnel = getFunnelMetrics(db);
    expect(funnel.total).toBe(2);
    expect(funnel.applied).toBe(1);
    expect(funnel.queued).toBe(1);

    const byPlatform = getPlatformMetrics(db);
    expect(byPlatform.djinni?.applied).toBe(1);
    expect(byPlatform.email?.queued).toBe(1);
  });
});
