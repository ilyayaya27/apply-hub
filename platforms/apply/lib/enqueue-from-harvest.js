import { classifyApplyRoute } from './router.js';
import { processVacancyPost } from './pipeline.js';
import { appendExternalSkip } from './external-feed.js';

const SKIP_ROUTES = new Set(['hh', 'linkedin']);
const HUMAN_ROUTES = new Set(['manual', 'telegram', 'rvc_bot']);

/** Тест/смоук-фикстуры не должны попадать в боевую базу (dry-run смоук — можно). */
const TEST_ID_RE = /(?:^|:)(?:test|drytest)(?::|$)/i;
const SMOKE_URL_RE = /rvc-smoke|\/123456(?:\/|$)/i;
function isTestFixture({ sourceId, postId, postUrl, links = [] }) {
  if (TEST_ID_RE.test(String(sourceId ?? '')) || TEST_ID_RE.test(String(postId ?? ''))) return true;
  const urls = [postUrl, ...(links ?? [])].map((u) => String(u ?? ''));
  return urls.some((u) => SMOKE_URL_RE.test(u));
}
const PRESERVE_ACTIONS = new Set([
  'skip_seen',
  'skip_resume_post',
  'skip_fit',
  'skip_external',
  'skip_duplicate',
]);

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

  // Защита прод-базы: тестовые/смоук-фикстуры не должны попадать в БД НИКОГДА —
  // processVacancyPost персистит и в dry-run, поэтому блокируем до него (это и был
  // исходный вектор загрязнения смоуком).
  if (isTestFixture({ sourceId, postId, postUrl, links })) {
    return {
      ok: true,
      results: [{ action: 'skip_test_fixture', route: 'skip', postUrl }],
    };
  }

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
  if (HUMAN_ROUTES.has(route) && !PRESERVE_ACTIONS.has(action)) action = 'needs_human';

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
