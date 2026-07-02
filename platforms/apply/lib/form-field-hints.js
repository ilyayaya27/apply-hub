/** Shared field matchers for HTML + Google Forms adapters */
export const FIELD_HINTS = [
  // telegram before name — bare /name/i matches the "name" inside "username"
  { key: 'telegram', patterns: [/telegram/i, /телеграм/i, /@/i, /\btg\b/i, /telegram.*username/i, /^username$/i] },
  { key: 'lastName', patterns: [/фамил/i, /surname/i, /last.?name/i] },
  { key: 'firstName', patterns: [/^имя$/i, /^введите имя$/i, /first.?name/i, /given.?name/i] },
  { key: 'name', patterns: [/\bname\b/i, /фio/i, /ф\.?\s*и\.?\s*о/i, /имя/i, /full.?name/i, /ваше имя/i] },
  { key: 'email', patterns: [/email/i, /e-mail/i, /почта/i, /\bmail\b/i] },
  { key: 'phone', patterns: [/phone/i, /tel/i, /телефон/i, /mobile/i] },
  { key: 'portfolio', patterns: [/portfolio/i, /github/i, /linkedin/i, /ссылка/i, /link/i, /url/i] },
  { key: 'coverLetter', patterns: [/cover/i, /letter/i, /message/i, /about/i, /comment/i, /сопровод/i, /письмо/i, /сообщение/i] },
  { key: 'resume', patterns: [/resume/i, /cv/i, /резюме/i, /file/i, /upload/i, /attach/i] },
];

/**
 * @param {string} label
 * @returns {string | null}
 */
export const matchFieldKey = (label) => {
  const text = String(label ?? '').trim();
  if (!text) return null;
  for (const { key, patterns } of FIELD_HINTS) {
    if (patterns.some((re) => re.test(text))) return key;
  }
  return null;
};

/**
 * @param {Record<string, string>} profile
 * @param {string} letter
 * @param {string} key
 */
export const valueForFieldKey = (profile, letter, key) => {
  // Use Russian name for RU market, Latin for EN/international
  const isRu = (profile.active_market ?? 'ru').toLowerCase() === 'ru';
  const displayName = isRu
    ? (profile.name_ru ?? profile.name ?? '')
    : (profile.name_en ?? profile.name ?? '');
  const parts = String(displayName).trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ') || firstName;

  switch (key) {
    case 'firstName':
      return firstName;
    case 'lastName':
      return lastName;
    case 'name':
      return displayName;
    case 'email':
      return profile.email ?? '';
    case 'telegram':
      return profile.telegram ?? '';
    case 'phone':
      return profile.phone ?? '';
    case 'portfolio':
      return profile.portfolio ?? profile.github ?? '';
    case 'coverLetter':
      return letter;
    default:
      return '';
  }
};
