import { applyHtmlForm } from '../forms/html-form.js';
import { careerPlatformId } from './hosts.js';

/** @param {string | null | undefined} url */
export const isVkCareersUrl = (url) => careerPlatformId(url) === 'vk_careers';

/**
 * VK Careers pilot — generic Playwright html-form until dedicated selectors land.
 * @param {Parameters<typeof applyHtmlForm>[0]} vacancy
 * @param {Parameters<typeof applyHtmlForm>[1]} ctx
 */
export const applyVkCareers = (vacancy, ctx) => applyHtmlForm(vacancy, ctx);
