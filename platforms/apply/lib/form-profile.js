import { config } from './config.js';

/**
 * Flat profile for form field mapping (HTML + Google Forms).
 * @param {Record<string, unknown>} profile
 */
export const normalizeFormProfile = (profile) => {
  const contact = profile?.contact ?? {};
  const telegram = String(contact.telegram ?? profile.telegram ?? '').replace(/^@/, '');
  const market = String(profile?.active_market ?? 'ru').toLowerCase();
  const isRu = market === 'ru';
  // Market-aware name: кириллица для RU, латиница для EN
  const marketName = isRu
    ? String(profile?.name_ru ?? profile?.name ?? config.applyName ?? '')
    : String(profile?.name_en ?? profile?.name ?? config.applyName ?? '');
  return {
    name: marketName || config.applyName,
    name_ru: String(profile?.name_ru ?? config.applyName ?? ''),
    name_en: String(profile?.name_en ?? config.applyName ?? ''),
    active_market: market,
    email: String(contact.email ?? profile.email ?? config.applyEmail ?? ''),
    telegram: telegram || 'ilyayaya27',
    phone: String(contact.phone ?? profile.phone ?? ''),
    portfolio: String(contact.portfolio ?? profile.github ?? profile.linkedin ?? ''),
  };
};
