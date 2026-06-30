import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../lib/db.js';
import { runTelegramChannelCycle } from '../lib/pipeline.js';
import { listQueue } from '../lib/store.js';
import { config } from '../lib/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'revacancy-channel.html');

describe('pipeline ingest boundary', () => {
  let tmpDir;

  let savedIngestMode;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'job-hub-pipe-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    savedIngestMode = config.tgIngestMode;
    config.tgIngestMode = 'preview';
    resetDbForTests();
  });

  afterEach(() => {
    resetDbForTests();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    config.tgIngestMode = savedIngestMode;
  });

  it('queues matching fixture posts and skips hh/seo', async () => {
    const stats = await runTelegramChannelCycle({
      channel: 'revacancy',
      fixturePath,
    });
    expect(stats.scanned).toBe(4);
    expect(stats.queued).toBeGreaterThanOrEqual(2);
    const queue = listQueue();
    expect(queue.every((q) => q.route !== 'hh')).toBe(true);
    expect(queue.some((q) => q.title?.match(/Frontend/i))).toBe(true);
    const formSmoke = queue.find((q) => q.postId === '150004');
    expect(formSmoke?.route).toBe('form');
    expect(formSmoke?.url).toContain('forms.gle/rvc-smoke-simple-form');
  });
});
