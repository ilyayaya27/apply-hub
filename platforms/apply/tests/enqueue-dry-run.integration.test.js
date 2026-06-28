import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../lib/db.js';

const root = join(fileURLToPath(import.meta.url), '../..');
const fixture = join(root, 'tests/fixtures/harvest-post-form.json');

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
});
