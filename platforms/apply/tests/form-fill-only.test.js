import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('fill_only dispatch', () => {
  let tmpDir;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-fill-only-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    process.env.JOB_HUB_SKIP_STATE_MIGRATE = '1';
    process.env.AUTO_APPLY = '1';
    process.env.APPLY_DELAY_MS_MIN = '0';
    process.env.APPLY_DELAY_MS_MAX = '0';
  });

  afterEach(() => {
    vi.resetModules();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    delete process.env.JOB_HUB_SKIP_STATE_MIGRATE;
    delete process.env.AUTO_APPLY;
    delete process.env.APPLY_DELAY_MS_MIN;
    delete process.env.APPLY_DELAY_MS_MAX;
  });

  it('returns vacancy to queued after fill-only form apply', async () => {
    vi.doMock('../workers/form-apply.js', () => ({
      applyViaForm: vi.fn(async () => ({
        ok: true,
        status: 'fill_only',
        note: 'filled 3 fields',
        adapter: 'html-form',
      })),
    }));
    vi.doMock('../workers/email-apply.js', () => ({
      applyViaEmail: vi.fn(async () => ({ ok: false, status: 'failed' })),
    }));
    vi.doMock('../lib/notify-telegram.js', () => ({
      sendTelegramNotify: vi.fn(async () => {}),
      formatApplyNotify: () => '',
    }));

    const store = await import('../lib/store.js');
    store.resetStateForTests();
    store.upsertVacancy({
      id: 'dry:form',
      source: 'test',
      route: 'form',
      status: 'queued',
      url: 'https://example.com/apply',
      title: 'Test',
    });

    const { dispatchApply } = await import('../lib/apply-dispatcher.js');
    const vac = store.dequeueNext();
    expect(vac?.key).toBe('dry:form');

    const result = await dispatchApply(vac);
    expect(result.status).toBe('fill_only');

    const row = store
      .getDb(process.env.JOB_HUB_DB)
      .prepare(`SELECT status FROM vacancies WHERE id = ?`)
      .get('dry:form');
    expect(row.status).toBe('queued');
  });
});
