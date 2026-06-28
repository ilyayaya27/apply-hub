import { parseVacancyText } from './parse.js';
import { classifyApplyRoute } from './router.js';
import { buildPostLink, contactLinkValues } from './tg-contacts.js';

const mergeLinks = (...groups) => {
  const seen = new Set();
  const out = [];
  groups.flat().forEach((link) => {
    const v = String(link ?? '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  });
  return out;
};

/**
 * @param {{ channel: string, postId: string, rawHtml?: string, rawText: string, hrefLinks?: string[] }} input
 */
export const buildVacancyPost = ({ channel, postId, rawHtml = '', rawText, hrefLinks = [] }) => {
  const links = mergeLinks(hrefLinks, contactLinkValues(rawText));
  const parsed = parseVacancyText(rawHtml || rawText);
  const route = classifyApplyRoute({ text: rawText, links });

  return {
    channel,
    postId,
    url: buildPostLink(channel, postId),
    previewUrl: `https://t.me/s/${channel}/${postId}`,
    links,
    ...parsed,
    ...route,
  };
};
