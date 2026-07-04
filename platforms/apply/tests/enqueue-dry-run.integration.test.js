import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../lib/db.js';
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

const root = join(fileURLToPath(import.meta.url), '../..');
const fixture = join(root, 'tests/fixtures/harvest-post-form.json');
const resumeFixture = join(root, 'tests/fixtures/harvest-post-resume.json');

describe('enqueue-dry-run CLI boundary', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-hub-enqueue-'));
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

  it('returns would_apply for form URL', () => {
    const stdout = execFileSync('node', [join(root, 'cli.js'), 'enqueue-dry-run', fixture], {
      encoding: 'utf8',
      env: { ...process.env },
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.results[0].action).toBe('would_apply');
    expect(parsed.results[0].route).toBe('form');
  });

  it('skips #резюме posts with email', () => {
    const post = JSON.parse(readFileSync(resumeFixture, 'utf8'));
    const result = enqueueFromHarvestPost({ ...post, dryRun: true, skipFitCheck: true });
    expect(result.results[0].action).toBe('skip_resume_post');
    expect(result.results[0].route).toBe('manual');
  });

  it('CLI enqueue-dry-run skips resume fixture', () => {
    const stdout = execFileSync('node', [join(root, 'cli.js'), 'enqueue-dry-run', resumeFixture], {
      encoding: 'utf8',
      env: { ...process.env },
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.results[0].action).toBe('skip_resume_post');
  });

  it('rejects test/smoke fixtures in BOTH dry-run and live (prod-DB guard)', () => {
    const tf = {
      sourceId: 'telegram:test',
      postId: 'bridge-1',
      postUrl: 'https://forms.gle/rvc-smoke-simple-form',
      rawText: 'smoke',
      links: ['https://forms.gle/rvc-smoke-simple-form'],
    };
    // dry-run тоже персистит через processVacancyPost — поэтому блокируем всегда
    const live = enqueueFromHarvestPost({ ...tf, dryRun: false, skipFitCheck: true });
    expect(live.results[0].action).toBe('skip_test_fixture');
    const dry = enqueueFromHarvestPost({ ...tf, dryRun: true, skipFitCheck: true });
    expect(dry.results[0].action).toBe('skip_test_fixture');
    // и в базу ничего не попало
    const leaked = enqueueFromHarvestPost({ ...tf, dryRun: true, skipFitCheck: true });
    expect(leaked.results[0].action).toBe('skip_test_fixture');
  });
});
