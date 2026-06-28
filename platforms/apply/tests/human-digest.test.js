import { describe, expect, it } from 'vitest';
import {
  buildHumanDigestText,
  formatHumanDigestLines,
  isHumanApplyRow,
} from '../lib/human-digest.js';

describe('human-digest', () => {
  it('filters manual, telegram, rvc_bot and needs_human', () => {
    const rows = [
      { route: 'email', action: 'would_apply', primaryUrl: 'hr@x.com', postUrl: 'https://t.me/a/1' },
      { route: 'manual', action: 'needs_human', primaryUrl: 'https://djinni.co/j/1', postUrl: 'https://t.me/a/2' },
      { route: 'hh', action: 'skip_external', primaryUrl: 'https://hh.ru/v/1', postUrl: 'https://t.me/a/3' },
      { route: 'telegram', action: 'needs_human', primaryUrl: 'https://t.me/hr', postUrl: 'https://t.me/a/4' },
    ];
    expect(rows.filter(isHumanApplyRow)).toHaveLength(2);
    const lines = formatHumanDigestLines(rows);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('[manual]');
    expect(buildHumanDigestText(rows)).toMatch(/^👤 Ручная очередь/);
  });

  it('returns empty string when no human rows', () => {
    expect(buildHumanDigestText([{ route: 'email', action: 'would_apply' }])).toBe('');
  });
});
