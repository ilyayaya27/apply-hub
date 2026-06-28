import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const RESUME_TEXT = `#резюме #frontend #react\n\nFrontend Developer ищу работу удалённо`;

describe('repairResumePosts', () => {
  let tmpDir;
  /** @type {typeof import('../lib/store.js')} */
  let store;
  /** @type {typeof import('../lib/repair-resume.js')} */
  let repair;

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-repair-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    process.env.JOB_HUB_SKIP_STATE_MIGRATE = '1';
    store = await import('../lib/store.js');
    repair = await import('../lib/repair-resume.js');
    store.resetStateForTests();
  });

  afterEach(() => {
    vi.resetModules();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    delete process.env.JOB_HUB_SKIP_STATE_MIGRATE;
  });

  it('dry-run lists wrongly applied resume posts', () => {
    store.upsertVacancy({
      id: 'tg:1',
      source: 'javascript_jobs',
      route: 'email',
      status: 'applied',
      rawText: RESUME_TEXT,
      url: 'candidate@mail.ru',
    });
    store.markApplied('tg:1', { method: 'email', note: 'sent' });

    const out = repair.repairResumePosts({ dryRun: true });
    expect(out.count).toBe(1);
    expect(out.actions[0].action).toBe('revert_applied');
  });

  it('apply reverts applied and clears success application row', () => {
    store.upsertVacancy({
      id: 'tg:2',
      source: 'javascript_jobs',
      route: 'email',
      status: 'applied',
      rawText: RESUME_TEXT,
      url: 'x@y.z',
    });
    store.markApplied('tg:2', { method: 'email', note: 'sent' });

    const out = repair.repairResumePosts({ dryRun: false });
    expect(out.fixed).toBe(1);

    const vac = store.getDb(process.env.JOB_HUB_DB)
      .prepare(`SELECT status FROM vacancies WHERE id = ?`)
      .get('tg:2');
    expect(vac.status).toBe('needs_human');

    const apps = store
      .getDb(process.env.JOB_HUB_DB)
      .prepare(`SELECT method, note FROM applications WHERE vacancy_id = ? ORDER BY id`)
      .all('tg:2');
    expect(apps.some((a) => a.method === 'email')).toBe(false);
    expect(apps.some((a) => a.note?.includes('skip_resume_post'))).toBe(true);
  });

  it('marks queued resume posts as needs_human', () => {
    store.upsertVacancy({
      id: 'tg:3',
      source: 'javascript_jobs',
      route: 'email',
      status: 'queued',
      rawText: RESUME_TEXT,
      url: 'hr@test.com',
    });

    repair.repairResumePosts({ dryRun: false });
    const row = store
      .getDb(process.env.JOB_HUB_DB)
      .prepare(`SELECT status FROM vacancies WHERE id = ?`)
      .get('tg:3');
    expect(row.status).toBe('needs_human');
  });

  it('ignores real vacancy posts', () => {
    store.upsertVacancy({
      id: 'tg:job',
      source: 'javascript_jobs',
      route: 'form',
      status: 'queued',
      rawText: '#вакансия\nИщем Frontend Developer\nhttps://djinni.co/jobs/99999-dev/',
      url: 'https://djinni.co/jobs/99999-dev/',
    });

    const out = repair.repairResumePosts({ dryRun: true });
    expect(out.count).toBe(0);
  });
});
