import { classifyApplyRoute } from './router.js';
import { processVacancyPost } from './pipeline.js';
import { appendExternalSkip } from './external-feed.js';

const SKIP_ROUTES = new Set(['hh', 'linkedin']);
const HUMAN_ROUTES = new Set(['manual', 'telegram', 'rvc_bot']);

/**
 * @param {object} input
 * @param {string} input.sourceId
 * @param {string} input.postId
 * @param {string} input.postUrl
 * @param {string} input.rawText
 * @param {string[]} input.links
 * @param {boolean} [input.dryRun=true]
 * @param {boolean} [input.skipFitCheck=true]
 */
export function enqueueFromHarvestPost(input) {
  const { sourceId, postId, postUrl, rawText, links, dryRun = true, skipFitCheck = true } = input;
  const { route, primaryUrl, hints } = classifyApplyRoute({ text: rawText, links });

  if (SKIP_ROUTES.has(route)) {
    appendExternalSkip({
      route,
      primaryUrl,
      postUrl,
      sourceId,
      postId,
    });
    return {
      ok: true,
      results: [{
        action: 'skip_external',
        route,
        primaryUrl,
        hints,
        postUrl,
      }],
    };
  }

  const post = {
    route,
    postId,
    channel: sourceId,
    url: postUrl,
    primaryUrl,
    rawText,
    hints,
    title: rawText.split('\n')[0]?.slice(0, 120) ?? 'Telegram vacancy',
  };

  const profile = skipFitCheck
    ? { min_fit_score: 0, exclude_patterns: [] }
    : undefined;

  const pipelineResult = processVacancyPost(post, sourceId, profile ?? { min_fit_score: 0, exclude_patterns: [] });

  let action = pipelineResult.action;
  if (dryRun && action === 'queued') action = 'would_apply';
  if (HUMAN_ROUTES.has(route) && action !== 'skip_seen') action = 'needs_human';

  return {
    ok: true,
    results: [{
      action,
      route,
      primaryUrl,
      key: pipelineResult.key,
      hints,
      postUrl,
      fitScore: pipelineResult.fitScore,
    }],
  };
}
