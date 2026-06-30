import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, resetDbForTests } from '../lib/db.js';
import { config } from '../lib/config.js';
import {
  enqueue,
  isSeen,
  markSeen,
  listQueue,
  migrateFromStateJson,
  dequeueNext,
  markApplied,
  releaseStaleProcessing,
  resetKeysForReingest,
} from '../lib/store.js';

describe('store sqlite boundary', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'job-hub-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    resetDbForTests();
  });

  afterEach(() => {
    resetDbForTests();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
  });

  it('enqueue prefers primaryUrl over telegram post url', () => {
    const key = 'revacancy:150004';
    enqueue({
      key,
      channel: 'revacancy',
      postId: '150004',
      fitScore: 90,
      route: 'form',
      title: 'Senior Frontend',
      url: 'https://t.me/revacancy/150004',
      primaryUrl: 'https://forms.gle/rvc-smoke-simple-form',
    });
    const row = getDb(config.dbPath).prepare('SELECT url FROM vacancies WHERE id = ?').get(key);
    expect(row.url).toBe('https://forms.gle/rvc-smoke-simple-form');
    expect(dequeueNext()?.url).toBe('https://forms.gle/rvc-smoke-simple-form');
  });

  it('enqueue returns true once and blocks duplicate active vacancy', () => {
    const key = 'revacancy:150001';
    expect(enqueue({ key, channel: 'revacancy', postId: '150001', fitScore: 70, route: 'form', title: 'FE' })).toBe(true);
    expect(listQueue()).toHaveLength(1);
    expect(enqueue({ key, channel: 'revacancy', postId: '150001', fitScore: 70, route: 'form', title: 'FE' })).toBe(false);
  });

  it('dequeueNext sets processing and markApplied clears queue', () => {
    const key = 'revacancy:150002';
    enqueue({ key, channel: 'revacancy', postId: '150002', fitScore: 80, route: 'email', title: 'React' });
    const item = dequeueNext();
    expect(item?.key).toBe(key);
    expect(listQueue()).toHaveLength(0);
    markApplied(key, { method: 'email' });
    expect(enqueue({ key, channel: 'revacancy', postId: '150002', fitScore: 80, route: 'email', title: 'React' })).toBe(false);
  });

  it('releaseStaleProcessing returns stuck processing to queued', () => {
    const key = 'revacancy:150003';
    enqueue({ key, channel: 'revacancy', postId: '150003', fitScore: 90, route: 'form', title: 'TS' });
    dequeueNext();
    expect(listQueue()).toHaveLength(0);
    const n = releaseStaleProcessing(0);
    expect(n).toBe(1);
    expect(listQueue()).toHaveLength(1);
  });

  it('resetKeysForReingest clears seen and vacancy for re-scan', () => {
    const key = 'revacancy:150001';
    markSeen(key);
    enqueue({ key, channel: 'revacancy', postId: '150001', fitScore: 70, route: 'rvc_bot', title: 'FE' });
    expect(isSeen(key)).toBe(true);
    expect(listQueue()).toHaveLength(1);
    resetKeysForReingest([key]);
    expect(isSeen(key)).toBe(false);
    expect(listQueue()).toHaveLength(0);
    expect(enqueue({ key, channel: 'revacancy', postId: '150001', fitScore: 70, route: 'rvc_bot', title: 'FE' })).toBe(true);
  });

  it('migrates state.json seen keys into sqlite', () => {
    const statePath = join(tmpDir, 'state.json');
    writeFileSync(
      statePath,
      JSON.stringify({
        seen: { 'revacancy:99': { at: '2026-01-01T00:00:00.000Z' } },
        queue: [],
        applied: [],
        history: [],
      }),
    );
    migrateFromStateJson(statePath);
    expect(isSeen('revacancy:99')).toBe(true);
    markSeen('revacancy:100');
    expect(isSeen('revacancy:100')).toBe(true);
  });
});
