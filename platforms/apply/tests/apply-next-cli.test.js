import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('apply-next CLI boundary', () => {
  it('returns empty results when queue is empty', () => {
    const proc = spawnSync('node', [join(root, 'cli.js'), 'apply-next', '1'], {
      encoding: 'utf8',
      env: { ...process.env, JOB_HUB_DB: ':memory:' },
    });
    expect(proc.status).toBe(0);
    const out = JSON.parse(proc.stdout);
    expect(out.ok).toBe(true);
    expect(out.results).toEqual([]);
  });
});
