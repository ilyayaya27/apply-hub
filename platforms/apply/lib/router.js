/** @typedef {'hh' | 'linkedin' | 'telegram' | 'rvc_bot' | 'form' | 'email' | 'manual'} ApplyRoute */

const HH_RE = /https?:\/\/(?:[\w-]+\.)?hh\.ru\/[^\s)]+/i;
const HH_BARE_RE = /\b(?:[\w-]+\.)?hh\.ru\/[^\s)\]>]+/gi;
const LI_RE = /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/[^\s)]+/i;
const LI_BARE_RE = /\b(?:[\w-]+\.)?linkedin\.com\/[^\s)\]>]+/gi;
const TG_RE = /https?:\/\/t\.me\/[^\s)]+/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const FORM_HINTS = [
  /forms\.gle\//i,
  /docs\.google\.com\/forms/i,
  /typeform\.com/i,
  /notion\.so/i,
  /apply\./i,
  /careers\./i,
  /jobs\./i,
];

import { careerHostPatterns } from '../adapters/platforms/hosts.js';

/** Career sites → form route (Playwright); adapters in adapters/platforms/ */
const CAREER_FORM_HOSTS = careerHostPatterns();

const withScheme = (raw) => (raw.startsWith('http') ? raw : `https://${raw}`);

const collectUrls = (text, links) => {
  const all = [...links];
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/gi)) all.push(m[0]);
  for (const m of text.matchAll(HH_BARE_RE)) all.push(withScheme(m[0]));
  for (const m of text.matchAll(LI_BARE_RE)) all.push(withScheme(m[0]));
  return [...new Set(all)];
};

/**
 * @param {{ text: string, links: string[] }} input
 * @returns {{ route: ApplyRoute, primaryUrl: string | null, hints: string[] }}
 */
export const classifyApplyRoute = ({ text, links }) => {
  const hints = [];
  const all = collectUrls(text, links);

  for (const url of all) {
    if (/revacancy_bot\?start=/i.test(url) || /rvc\.global/i.test(url)) {
      return { route: "rvc_bot", primaryUrl: url, hints: ["Открыть бота RVC для контактов"] };
    }
  }

  for (const url of all) {
    if (HH_RE.test(url)) {
      hints.push("Дубликат HH — отклик через hh-applicant-tool, не трогать отсюда");
      return { route: "hh", primaryUrl: url, hints };
    }
  }

  for (const url of all) {
    if (LI_RE.test(url)) {
      hints.push("LinkedIn — отклик через li-easy-apply, не трогать отсюда");
      return { route: "linkedin", primaryUrl: url, hints };
    }
  }

  for (const url of all) {
    if (FORM_HINTS.some((re) => re.test(url))) {
      return { route: "form", primaryUrl: url, hints: ["Заполнить форму (Playwright, dry-run по умолчанию)"] };
    }
  }

  for (const url of all) {
    if (CAREER_FORM_HOSTS.some((re) => re.test(url))) {
      return {
        route: "form",
        primaryUrl: url,
        hints: ["Career site — Playwright (platform adapter при наличии)"],
      };
    }
  }

  for (const url of all) {
    if (TG_RE.test(url) && !/revacancy\/\d+$/i.test(url)) {
      return { route: "telegram", primaryUrl: url, hints: ["Написать в Telegram HR"] };
    }
  }

  if (EMAIL_RE.test(text)) {
    const email = text.match(EMAIL_RE)?.[0] ?? null;
    return { route: "email", primaryUrl: email, hints: ["Отправить письмо"] };
  }

  const botLink = all.find((u) => /t\.me\/\w+_?bot/i.test(u));
  if (botLink) {
    return { route: "rvc_bot", primaryUrl: botLink, hints };
  }

  return { route: "manual", primaryUrl: all[0] ?? null, hints: ["Нужен ручной разбор поста"] };
};
