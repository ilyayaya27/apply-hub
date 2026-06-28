import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetDbForTests } from '../lib/db.js';
import { buildAuditReport, formatAuditReport } from '../lib/audit.js';

describe('audit', () => {
  let tmpDir;
  let harvestPath;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-hub-audit-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    process.env.JOB_HUB_SKIP_STATE_MIGRATE = '1';
    process.env.EXTERNAL_FEED_PATH = join(tmpDir, 'feed.jsonl');
    harvestPath = join(tmpDir, 'harvest.json');
    resetDbForTests();
  });

  afterEach(() => {
    resetDbForTests();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    delete process.env.JOB_HUB_SKIP_STATE_MIGRATE;
    delete process.env.EXTERNAL_FEED_PATH;
  });

  it('includes human digest from harvest report', () => {
    writeFileSync(
      harvestPath,
      JSON.stringify({
        summary: { scanned: 10, matched: 2, rejected: 8 },
        applyDryRun: [
          {
            route: 'manual',
            action: 'needs_human',
            primaryUrl: 'https://t.me/revacancy/1',
            postUrl: 'https://t.me/c/1/2',
          },
        ],
      }),
      'utf8',
    );

    const report = buildAuditReport({ harvestPath });
    expect(report.harvestSummary?.scanned).toBe(10);
    expect(report.humanDigest).toMatch(/manual/);
    expect(formatAuditReport(report)).toMatch(/Apply hub audit/);
  });
});
