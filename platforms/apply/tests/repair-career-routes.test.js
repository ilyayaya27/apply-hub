import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('repairCareerRoutes', () => {
  let tmpDir;
  /** @type {typeof import('../lib/store.js')} */
  let store;
  /** @type {typeof import('../lib/repair-career-routes.js')} */
  let repair;

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-repair-career-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    process.env.JOB_HUB_SKIP_STATE_MIGRATE = '1';
    store = await import('../lib/store.js');
    repair = await import('../lib/repair-career-routes.js');
    store.resetStateForTests();
  });

  afterEach(() => {
    vi.resetModules();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    delete process.env.JOB_HUB_SKIP_STATE_MIGRATE;
  });

  it('dry-run flags manual career URLs for re-route', () => {
    store.upsertVacancy({
      id: 'rwb:1',
      source: 'easy_frontend_jobs',
      route: 'manual',
      status: 'queued',
      url: 'https://career.rwb.ru/vacancies/25895',
      rawText: 'Frontend',
    });

    const out = repair.repairCareerRoutes({ dryRun: true });
    expect(out.count).toBe(1);
    expect(out.actions[0].platformId).toBe('rwb_careers');
    expect(out.actions[0].from).toBe('manual');
  });

  it('--apply sets route to form', async () => {
    store.upsertVacancy({
      id: 'ya:1',
      source: 'easy_frontend_jobs',
      route: 'manual',
      status: 'queued',
      url: 'https://yandex.ru/jobs/vacancies/123',
      rawText: 'Frontend',
    });

    repair.repairCareerRoutes({ dryRun: false });
    const { getDb } = await import('../lib/db.js');
    const { config } = await import('../lib/config.js');
    const row = getDb(config.dbPath).prepare('SELECT route FROM vacancies WHERE id = ?').get('ya:1');
    expect(row?.route).toBe('form');
  });
});
