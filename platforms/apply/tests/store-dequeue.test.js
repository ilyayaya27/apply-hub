import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('dequeueNext', () => {
  let tmpDir;
  let store;

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-hub-dequeue-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    process.env.JOB_HUB_SKIP_STATE_MIGRATE = '1';
    process.env.AUTO_APPLY = '1';
    store = await import('../lib/store.js');
    store.resetStateForTests();
  });

  afterEach(() => {
    vi.resetModules();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    delete process.env.JOB_HUB_SKIP_STATE_MIGRATE;
    delete process.env.AUTO_APPLY;
  });

  it('skips manual/telegram when AUTO_APPLY and picks form/email by fit', () => {
    store.upsertVacancy({
      id: 'manual:1',
      source: 'tg',
      route: 'manual',
      fitScore: 99,
      status: 'queued',
    });
    store.upsertVacancy({
      id: 'form:1',
      source: 'tg',
      route: 'form',
      fitScore: 50,
      status: 'queued',
    });

    const next = store.dequeueNext();
    expect(next?.key).toBe('form:1');
    expect(next?.route).toBe('form');
  });

  it('does not count needs_human against daily apply quota', () => {
    store.upsertVacancy({
      id: 'x:1',
      source: 'tg',
      route: 'manual',
      status: 'queued',
    });
    store.upsertVacancy({
      id: 'x:2',
      source: 'tg',
      route: 'form',
      status: 'queued',
    });
    store.markNeedsHuman('x:1', 'manual');
    expect(store.countApplicationsToday()).toBe(0);
    store.markApplied('x:2', { method: 'form', note: 'ok' });
    expect(store.countApplicationsToday()).toBe(1);
  });

  it('does not count failed applies against daily quota', () => {
    store.upsertVacancy({ id: 'f:1', source: 'tg', route: 'form', status: 'queued' });
    store.upsertVacancy({ id: 'f:2', source: 'tg', route: 'email', status: 'queued' });
    store.markFailed('f:1', 'HTTP 500');
    expect(store.countApplicationsToday()).toBe(0);
    store.markApplied('f:2', { method: 'email', note: 'ok' });
    expect(store.countApplicationsToday()).toBe(1);
  });
});
