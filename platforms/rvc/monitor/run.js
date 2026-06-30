#!/usr/bin/env node
import { config } from '../lib/config.js';
import { runFullCycle } from '../lib/pipeline.js';
import { applyNext } from '../lib/apply-dispatcher.js';
import { sendTelegramNotify, formatMatchNotify } from '../lib/notify-telegram.js';
import { getEnabledTelegramChannels } from '../lib/sources.js';
import { loadProfile, getActiveMarket, getMarketAssets } from '../lib/profile.js';

const log = (msg) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const onMatch = async (result) => {
  log(formatMatchNotify(result));
  await sendTelegramNotify(formatMatchNotify(result), { kind: 'match' });
};

const main = async () => {
  const profile = loadProfile();
  const market = getActiveMarket(profile);
  const assets = getMarketAssets(profile);
  const channels = getEnabledTelegramChannels();
  log(
    `monitor start | market=${market} | tg=${channels.length} channels | ingest=${config.tgIngestMode} | letter=${assets.cover_letter_path} | min=${profile.min_fit_score ?? config.minFitScore} | auto=${config.autoApply}`,
  );

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const totals = await runFullCycle({ onMatch });
      log(`scan done | scanned=${totals.scanned} queued=${totals.queued}`);

      if (config.autoApply && totals.queued > 0) {
        let applied = 0;
        while (applied < config.maxAppliesPerDay) {
          const next = await applyNext();
          if (!next) break;
          if (next.result?.ok) applied += 1;
          log(`apply ${next.vacancy?.title ?? '—'} → ${next.result?.status}`);
        }
      }
    } catch (err) {
      log(`cycle error: ${err.message ?? err}`);
    }

    await sleep(config.monitorIntervalMin * 60_000);
  }
};

main();
