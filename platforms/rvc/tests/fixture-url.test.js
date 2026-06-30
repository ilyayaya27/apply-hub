import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../lib/config.js';
import { resolveApplyUrl } from '../lib/fixture-url.js';

describe('resolveApplyUrl', () => {
  it('maps smoke forms.gle alias to local simple-form fixture', () => {
    const resolved = resolveApplyUrl('https://forms.gle/rvc-smoke-simple-form');
    const expected = pathToFileURL(join(ROOT, 'fixtures', 'simple-form.html')).href;
    expect(resolved).toBe(expected);
  });

  it('passes through unknown URLs unchanged', () => {
    const url = 'https://example.com/apply';
    expect(resolveApplyUrl(url)).toBe(url);
  });
});
