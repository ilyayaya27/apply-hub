/** Пост кандидата (#резюме / «ищу работу»), не вакансия — не авто-откликать. */

import { careerHostPatterns } from '../adapters/platforms/hosts.js';

const RESUME_TAG = /#(?:резюме|resume|cv|opentowork|open_to_work)/i;
const RESUME_SEEKING =
  /(?:^|[\s,.(])(?:ищу\s+(?:работу|позицию|удалёнку|remote)|looking\s+for\s+(?:a\s+)?(?:job|role|work)|open\s+to\s+work)/i;
const VACANCY_SIGNAL =
  /(?:^|[\s,.(])(?:ваканс|ищем|hiring|vacancy|отклик(?:нуться)?|apply\s+now|job\s+opening)/i;
const HH_JOB_URL = /hh\.ru\/vacancy/i;
const CAREER_HOSTS = careerHostPatterns();

const textHasCareerJobUrl = (t) =>
  HH_JOB_URL.test(t) || CAREER_HOSTS.some((re) => re.test(t));

/**
 * @param {string | null | undefined} text
 */
export const isCandidateResumePost = (text) => {
  const t = String(text ?? '').trim();
  if (!t) return false;

  if (textHasCareerJobUrl(t)) return false;
  if (VACANCY_SIGNAL.test(t) && !RESUME_TAG.test(t)) return false;

  const firstLine = t.split('\n')[0] ?? '';
  if (/^#?\s*резюме/i.test(firstLine)) return true;
  if (RESUME_TAG.test(t)) return true;
  if (RESUME_SEEKING.test(t) && !VACANCY_SIGNAL.test(t)) return true;

  return false;
};
