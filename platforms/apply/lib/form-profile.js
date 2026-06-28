import { config } from './config.js';

/**
 * Flat profile for form field mapping (HTML + Google Forms).
 * @param {Record<string, unknown>} profile
 */
export const normalizeFormProfile = (profile) => {
  const contact = profile?.contact ?? {};
  const telegram = String(contact.telegram ?? profile.telegram ?? '').replace(/^@/, '');
  return {
    name: config.applyName ?? String(profile.name ?? ''),
    email: String(contact.email ?? profile.email ?? config.applyEmail ?? ''),
    telegram: telegram || 'ilyayaya27',
    phone: String(contact.phone ?? profile.phone ?? ''),
    portfolio: String(contact.portfolio ?? profile.github ?? profile.linkedin ?? ''),
  };
};
