import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../lib/db.js';
import { config } from '../lib/config.js';
import { runTelegramChannelCycle } from '../lib/pipeline.js';
import { applyNext } from '../lib/apply-dispatcher.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', 'fixtures', 'revacancy-channel.html');

const playwrightAvailable = async () => {
  try {
    await import('playwright');
    return true;
  } catch {
    return false;
  }
};

const hasPlaywright = await playwrightAvailable();

describe('applyNext smoke (form dry-run)', () => {
  let tmpDir;
  /** @type {Partial<typeof config>} */
  let savedConfig;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'job-hub-apply-smoke-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    process.env.TG_INGEST_MODE = 'preview';
    resetDbForTests();

    savedConfig = {
      playwrightEnabled: config.playwrightEnabled,
      formSubmit: config.formSubmit,
      applyDelayMsMin: config.applyDelayMsMin,
      applyDelayMsMax: config.applyDelayMsMax,
      autoApply: config.autoApply,
      tgIngestMode: config.tgIngestMode,
    };
    config.playwrightEnabled = true;
    config.formSubmit = false;
    config.applyDelayMsMin = 0;
    config.applyDelayMsMax = 0;
    config.autoApply = true;
    config.tgIngestMode = 'preview';
  });

  afterEach(() => {
    Object.assign(config, savedConfig);
    resetDbForTests();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    delete process.env.TG_INGEST_MODE;
  });

  it.skipIf(!hasPlaywright)(
    'scan → applyNext skips rvc_bot then dry-runs html-form on smoke fixture',
    async () => {
      const stats = await runTelegramChannelCycle({
        channel: 'revacancy',
        fixturePath,
      });
      expect(stats.scanned).toBe(4);
      expect(stats.queued).toBeGreaterThanOrEqual(2);

      const first = await applyNext();
      expect(first?.vacancy.postId).toBe('150001');
      expect(first?.vacancy.route).toBe('rvc_bot');
      expect(first?.result.status).toBe('needs_human');
      expect(first?.result.error).toBe('manual_route_rvc_bot');

      const second = await applyNext();
      expect(second?.vacancy.postId).toBe('150004');
      expect(second?.vacancy.route).toBe('form');
      expect(second?.vacancy.url).toContain('forms.gle/rvc-smoke-simple-form');
      expect(second?.result.status).toBe('fill_only');
      expect(second?.result.adapter).toBe('html-form');

      const filled = second?.result.plan?.filled ?? {};
      expect(filled.applicant_name).toBe(config.applyName);
      expect(filled.cover_letter).toBeTruthy();
      expect(filled.telegram).toBeTruthy();
    },
    120_000,
  );
});
