import { existsSync } from 'node:fs';
import { config } from '../lib/config.js';
import { loadCoverLetter } from '../lib/letter.js';
import { loadProfile, getMarketAssets } from '../lib/profile.js';

export async function applyViaEmail(vacancy, ctx = {}) {
  const to = vacancy.primaryUrl ?? vacancy.url;
  if (!to || !to.includes('@')) {
    return { ok: false, status: 'failed', error: 'invalid_email' };
  }

  if (config.dryRun) {
    return {
      ok: false,
      status: 'dry_run',
      note: `dry-run: would email ${to}`,
      draft: buildEmailDraft(vacancy),
    };
  }

  if (!config.smtpHost || !config.smtpUser || !config.applyEmail) {
    return {
      ok: false,
      status: 'needs_human',
      error: 'SMTP не настроен — отправь письмо вручную',
      draft: buildEmailDraft(vacancy),
    };
  }

  const letter = ctx.letter ?? loadCoverLetter();
  const profile = ctx.profile ?? loadProfile();
  const subject = `Отклик: ${vacancy.title ?? 'Frontend Developer'} — Ilya Silkin`;

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });

    const { resume_path: resumePath } = getMarketAssets(profile);
    const attachments = existsSync(resumePath)
      ? [{ filename: 'resume.pdf', path: resumePath }]
      : [];

    await transporter.sendMail({
      from: config.smtpFrom || config.applyEmail,
      to,
      subject,
      text: letter,
      attachments,
    });

    return { ok: true, status: 'applied', note: `email to ${to}` };
  } catch (err) {
    return { ok: false, status: 'failed', error: err.message ?? String(err) };
  }
}

export function buildEmailDraft(vacancy) {
  const to = vacancy.primaryUrl ?? vacancy.url;
  const letter = loadCoverLetter();
  return {
    to,
    subject: `Отклик: ${vacancy.title ?? 'Frontend Developer'}`,
    body: letter,
  };
}
