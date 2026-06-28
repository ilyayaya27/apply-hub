import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/config.js', () => ({
  config: {
    dryRun: true,
    smtpHost: 'smtp.example.com',
    smtpUser: 'u',
    smtpPass: 'p',
    applyEmail: 'me@example.com',
  },
}));

vi.mock('../lib/letter.js', () => ({
  loadCoverLetter: () => 'Hello',
}));

vi.mock('../lib/profile.js', () => ({
  loadProfile: () => ({}),
  getMarketAssets: () => ({ resume_path: '/no/such/file.pdf' }),
}));

describe('applyViaEmail dry-run', () => {
  it('does not send when APPLY_DRY_RUN=1', async () => {
    const { applyViaEmail } = await import('../workers/email-apply.js');
    const r = await applyViaEmail({
      primaryUrl: 'hr@company.com',
      title: 'Frontend',
    });
    expect(r.status).toBe('dry_run');
    expect(r.draft?.to).toBe('hr@company.com');
  });
});
