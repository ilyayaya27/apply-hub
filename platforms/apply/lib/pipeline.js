import { evaluateVacancy } from './fit.js';
import { isCandidateResumePost } from './resume-post.js';
import { loadProfile, compileExcludeRegexes } from './profile.js';
import { getEnabledTelegramChannels, getEnabledPlatforms } from './sources.js';
import { ingestChannel } from './ingest.js';
import { config } from './config.js';
import { scrapePlatformListings } from '../adapters/platform-scrape.js';
import {
  vacancyKey,
  platformVacancyKey,
  isSeen,
  markSeen,
  enqueue,
  appendHistory,
  resetKeysForReingest,
} from './store.js';

const SKIP_ROUTES = new Set(['hh', 'linkedin']);

/**
 * @param {import('./types.js').ParsedVacancy & { route: string, postId?: string, channel?: string, url?: string, primaryUrl?: string }} post
 * @param {string} sourceId
 * @param {{ min_fit_score?: number, exclude_patterns?: RegExp[] }} profile
 */
export function processVacancyPost(post, sourceId, profile) {
  const postId = post.postId ?? post.externalId ?? '0';
  const key =
    post.key ??
    (post.platformUrl
      ? platformVacancyKey(sourceId, post.platformUrl)
      : vacancyKey(sourceId, postId));

  if (isSeen(key)) return { action: 'skip_seen', key };

  if (isCandidateResumePost(post.rawText ?? post.title ?? '')) {
    markSeen(key, { fitScore: 0, route: post.route, reason: 'resume_post' });
    return { action: 'skip_resume_post', key, route: post.route };
  }

  const evaluation = evaluateVacancy(post, profile);
  markSeen(key, {
    fitScore: evaluation.fitScore,
    route: post.route,
    reason: evaluation.reason,
  });

  if (SKIP_ROUTES.has(post.route)) {
    return { action: 'skip_external', key, fitScore: evaluation.fitScore };
  }

  if (!evaluation.pass) {
    return { action: 'skip_fit', key, fitScore: evaluation.fitScore, reason: evaluation.reason };
  }

  const queued = enqueue({
    key,
    channel: sourceId,
    source: sourceId,
    postId,
    fitScore: evaluation.fitScore,
    route: post.route,
    title: post.title,
    url: post.url,
    primaryUrl: post.primaryUrl ?? post.url,
    company: post.company,
    rawText: post.rawText,
    hints: post.hints,
  });

  if (queued) {
    appendHistory({
      key,
      fitScore: evaluation.fitScore,
      route: post.route,
      title: post.title,
    });
  }

  return {
    action: queued ? 'queued' : 'skip_duplicate',
    key,
    fitScore: evaluation.fitScore,
    route: post.route,
    title: post.title,
    url: post.primaryUrl ?? post.url,
  };
}

export function getProfileContext(root) {
  const profile = loadProfile(root);
  return {
    profile,
    minScore: profile.min_fit_score ?? 55,
    excludePatterns: compileExcludeRegexes(profile),
  };
}

const resolveTgIngestMode = (opts = {}) => opts.tgIngestMode ?? config.tgIngestMode ?? 'preview';

/**
 * @param {{ root?: string, fixturePath?: string, channel?: string, onMatch?: (r: object) => void, tgIngestMode?: 'preview' | 'gramjs', gramJsClient?: import('telegram').TelegramClient, fresh?: boolean }} opts
 */
export async function runTelegramChannelCycle(opts = {}) {
  const { root, fixturePath, channel, onMatch, tgIngestMode, gramJsClient, fresh } = opts;
  const { profile, minScore, excludePatterns } = getProfileContext(root);
  const profileCtx = { min_fit_score: minScore, exclude_patterns: excludePatterns };
  const mode = resolveTgIngestMode({ tgIngestMode });

  const posts = await ingestChannel({
    channel,
    fixturePath,
    tgIngestMode: mode,
    gramJsClient: mode === 'gramjs' ? gramJsClient : undefined,
  });

  if (fresh && posts.length) {
    const keys = posts.map((post) =>
      post.key ??
      (post.platformUrl
        ? platformVacancyKey(channel, post.platformUrl)
        : vacancyKey(channel, post.postId ?? post.externalId ?? '0')),
    );
    resetKeysForReingest(keys);
  }

  const stats = { scanned: posts.length, queued: 0, skipped: 0 };

  posts.forEach((post) => {
    const result = processVacancyPost({ ...post, channel }, channel, profileCtx);
    if (result.action === 'queued') {
      stats.queued += 1;
      onMatch?.(result);
    } else {
      stats.skipped += 1;
    }
  });

  return stats;
}

/**
 * @param {{ root?: string, source?: object, fixturePath?: string, onMatch?: (r: object) => void }} opts
 */
export async function runPlatformSourceCycle(opts = {}) {
  const { root, source, fixturePath, onMatch } = opts;
  const { minScore, excludePatterns } = getProfileContext(root);
  const profileCtx = { min_fit_score: minScore, exclude_patterns: excludePatterns };

  const listings = await scrapePlatformListings(source, { fixturePath });
  const stats = { scanned: listings.length, queued: 0, skipped: 0 };

  listings.forEach((item) => {
    const result = processVacancyPost(
      {
        ...item,
        postId: item.externalId,
        key: platformVacancyKey(source.id, item.url),
      },
      source.id,
      profileCtx,
    );
    if (result.action === 'queued') {
      stats.queued += 1;
      onMatch?.(result);
    } else {
      stats.skipped += 1;
    }
  });

  return stats;
}

/**
 * @param {{ root?: string, fixturePath?: string, telegramChannel?: string, platformId?: string, onMatch?: (r: object) => void, tgIngestMode?: 'preview' | 'gramjs', gramJsClient?: import('telegram').TelegramClient, fresh?: boolean }} opts
 */
export async function runFullCycle(opts = {}) {
  const {
    root,
    fixturePath,
    telegramChannel,
    platformId,
    onMatch,
    tgIngestMode,
    gramJsClient: externalGramJsClient,
    fresh,
  } = opts;
  const totals = { telegram: [], platforms: [], queued: 0, scanned: 0 };
  const mode = resolveTgIngestMode({ tgIngestMode });
  const useGramJs = mode === 'gramjs' && !fixturePath;
  const ownsGramJs = useGramJs && !externalGramJsClient;
  let gramJsClient = externalGramJsClient;

  if (ownsGramJs) {
    const { getGramJsClient } = await import('./ingest-gramjs.js');
    gramJsClient = await getGramJsClient(config);
  }

  const tgCycleOpts = {
    root,
    fixturePath,
    onMatch,
    tgIngestMode: mode,
    gramJsClient: useGramJs ? gramJsClient : undefined,
    fresh,
  };

  try {
    if (telegramChannel) {
      const stats = await runTelegramChannelCycle({
        ...tgCycleOpts,
        channel: telegramChannel,
      });
      totals.telegram.push({ channel: telegramChannel, ...stats });
      totals.queued += stats.queued;
      totals.scanned += stats.scanned;
      return totals;
    }

    if (platformId) {
      const source = getEnabledPlatforms(root).find((s) => s.id === platformId);
      if (!source) throw new Error(`Platform not enabled: ${platformId}`);
      const stats = await runPlatformSourceCycle({
        root,
        source,
        fixturePath,
        onMatch,
      });
      totals.platforms.push({ id: platformId, ...stats });
      totals.queued += stats.queued;
      totals.scanned += stats.scanned;
      return totals;
    }

    const channels = getEnabledTelegramChannels(root);
    for (const ch of channels) {
      const stats = await runTelegramChannelCycle({
        ...tgCycleOpts,
        channel: ch.preview,
      });
      totals.telegram.push({ channel: ch.preview, ...stats });
      totals.queued += stats.queued;
      totals.scanned += stats.scanned;
    }

    const platforms = getEnabledPlatforms(root);
    for (const src of platforms) {
      const stats = await runPlatformSourceCycle({ root, source: src, onMatch });
      totals.platforms.push({ id: src.id, ...stats });
      totals.queued += stats.queued;
      totals.scanned += stats.scanned;
    }

    return totals;
  } finally {
    if (ownsGramJs) {
      const { resetGramJsClient } = await import('./ingest-gramjs.js');
      resetGramJsClient();
    }
  }
}
