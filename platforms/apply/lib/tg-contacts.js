/** @typedef {'telegram_username' | 'telegram_link' | 'email' | 'job_url'} ContactKind */

/** @typedef {{ kind: ContactKind, value: string }} ExtractedContact */

const JOB_HOST_FRAGMENTS = [
  'hh.ru',
  'habr.com',
  'team.vk.company',
  'getmatch.ru',
  'hirify.me',
  'hirehi.ru',
  'jobrockets.ru',
  'linkedin.com',
  'djinni.co',
  'djinni.io',
  'startup.jobs',
  'remoteok.com',
  'wellfound.com',
  'angel.co',
];

const normalizeTelegramUsername = (handle) => handle.replace(/^@/, '').toLowerCase();

const uniqByValue = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.kind}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** @param {string} raw */
export const normalizeJobUrl = (raw) => {
  try {
    const u = new URL(raw);
    u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) =>
      u.searchParams.delete(k),
    );
    const pathname = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.host.toLowerCase()}${pathname}${u.search}`;
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, '');
  }
};

/** @param {string} text @returns {ExtractedContact[]} */
export const extractContacts = (text) => {
  const found = [];

  const tgHandleRe = /(^|[^\w@])@([a-z][a-z0-9_]{3,31})\b/giu;
  for (const m of text.matchAll(tgHandleRe)) {
    const handle = normalizeTelegramUsername(m[2] ?? '');
    if (!handle) continue;
    found.push({ kind: 'telegram_username', value: `https://t.me/${handle}` });
  }

  const tgLinkRe = /(?:https?:\/\/)?(?:www\.)?t\.me\/([a-z][a-z0-9_]{3,31})(?:\/[^\s]*)?/giu;
  for (const m of text.matchAll(tgLinkRe)) {
    const handle = normalizeTelegramUsername(m[1] ?? '');
    if (!handle) continue;
    found.push({ kind: 'telegram_link', value: `https://t.me/${handle}` });
  }

  const emailRe = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/giu;
  for (const m of text.matchAll(emailRe)) {
    found.push({ kind: 'email', value: m[0].toLowerCase() });
  }

  const urlRe = /\bhttps?:\/\/[^\s<>()]+[^\s<>().,:;!?]/giu;
  for (const m of text.matchAll(urlRe)) {
    const rawUrl = m[0];
    const lower = rawUrl.toLowerCase();
    if (!JOB_HOST_FRAGMENTS.some((frag) => lower.includes(frag))) continue;
    found.push({ kind: 'job_url', value: normalizeJobUrl(rawUrl) });
  }

  const bareJobRe =
    /\b(?:[\w-]+\.)?(?:hh\.ru|habr\.com|team\.vk\.company|getmatch\.ru|hirify\.me|hirehi\.ru|jobrockets\.ru|linkedin\.com|djinni\.co|djinni\.io|startup\.jobs|remoteok\.com|wellfound\.com|angel\.co)\/[^\s<>().,:;!?]+/giu;
  for (const m of text.matchAll(bareJobRe)) {
    const raw = m[0];
    const withScheme = raw.startsWith('http') ? raw : `https://${raw}`;
    const lower = withScheme.toLowerCase();
    if (!JOB_HOST_FRAGMENTS.some((frag) => lower.includes(frag))) continue;
    found.push({ kind: 'job_url', value: normalizeJobUrl(withScheme) });
  }

  return uniqByValue(found);
};

/** @param {string} text */
export const contactLinkValues = (text) => extractContacts(text).map((c) => c.value);

/**
 * @param {string} channel preview slug or @handle
 * @param {number|string} messageId
 */
export const buildPostLink = (channel, messageId) => {
  const slug = channel.startsWith('@') ? channel.slice(1) : channel;
  return `https://t.me/${slug}/${messageId}`;
};

/** @param {string} preview */
export const previewToGramJsChat = (preview) =>
  preview.startsWith('@') ? preview : `@${preview}`;
