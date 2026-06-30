#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './lib/config.js';
import { runFullCycle, runTelegramChannelCycle } from './lib/pipeline.js';
import { applyNext, getApplyStats } from './lib/apply-dispatcher.js';
import {
  listQueue,
  markApplied,
  markNeedsHuman,
  countAppliedToday,
  resetDbForTests,
  releaseStaleProcessing,
} from './lib/store.js';
import { loadCoverLetter } from './lib/letter.js';
import {
  sendTelegramNotify,
  formatMatchNotify,
  formatDailySummary,
} from './lib/notify-telegram.js';
import { getEnabledTelegramChannels } from './lib/sources.js';
import { loadProfile } from './lib/profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname);

const args = process.argv.slice(2);
const cmd = args[0] ?? 'help';

const log = (msg) => console.log(msg);

const onMatch = async (result) => {
  await sendTelegramNotify(formatMatchNotify(result), { kind: 'match' });
};

if (cmd === 'scan') {
  const fixtureIdx = args.indexOf('--fixture');
  const fixturePath =
    fixtureIdx >= 0 ? join(root, args[fixtureIdx + 1] ?? 'fixtures/revacancy-channel.html') : undefined;
  const channelArg = args.find((a) => a.startsWith('--channel='))?.split('=')[1];
  const platformArg = args.find((a) => a.startsWith('--platform='))?.split('=')[1];
  const ingestArg = args.find((a) => a.startsWith('--ingest='))?.split('=')[1];
  const tgIngestMode =
    ingestArg === 'gramjs' || ingestArg === 'preview' ? ingestArg : undefined;
  const telegramChannel =
    channelArg ?? (fixturePath && !platformArg ? 'revacancy' : undefined);

  const fresh = args.includes('--fresh');

  const totals = await runFullCycle({
    root,
    fixturePath,
    telegramChannel,
    platformId: platformArg,
    tgIngestMode,
    onMatch,
    fresh,
  });

  log(JSON.stringify(totals, null, 2));
  process.exit(0);
}

if (cmd === 'run-cycle') {
  const totals = await runFullCycle({ root, onMatch });
  log(`Cycle: scanned=${totals.scanned} queued=${totals.queued}`);
  if (config.autoApply) {
    let applied = 0;
    while (applied < config.maxAppliesPerDay) {
      const next = await applyNext();
      if (!next) break;
      if (next.result?.ok) applied += 1;
    }
    log(`Applied this run: ${applied}`);
  }
  process.exit(0);
}

if (cmd === 'apply-next') {
  const n = Number(args[1] ?? 1);
  for (let i = 0; i < n; i += 1) {
    const next = await applyNext();
    if (!next) {
      log('Queue empty');
      break;
    }
    log(JSON.stringify(next, null, 2));
  }
  process.exit(0);
}

if (cmd === 'queue') {
  if (args[1] === 'release-stuck') {
    const minutes = Number(args[2] ?? 0);
    const n = releaseStaleProcessing(Number.isFinite(minutes) ? minutes : 0);
    log(`Released ${n} vacancy/vacancies from processing → queued`);
    process.exit(0);
  }
  const q = listQueue();
  log(JSON.stringify(q, null, 2));
  process.exit(0);
}

if (cmd === 'report') {
  const stats = {
    ...getApplyStats(),
    appliedToday: countAppliedToday(),
    profile: loadProfile().role,
    minFitScore: loadProfile().min_fit_score ?? config.minFitScore,
    channels: getEnabledTelegramChannels(root).map((c) => c.preview),
  };
  const text = formatDailySummary({
    scanned: 0,
    queued: stats.queueLeft,
    appliedToday: stats.appliedToday,
    queueLeft: stats.queueLeft,
  });
  log(text);
  log(JSON.stringify(stats, null, 2));
  await sendTelegramNotify(text, { kind: 'daily_summary' });
  process.exit(0);
}

if (cmd === 'letter') {
  log(loadCoverLetter());
  process.exit(0);
}

if (cmd === 'mark-applied') {
  const key = args[1];
  if (!key) {
    console.error('Usage: mark-applied <vacancy-key>');
    process.exit(1);
  }
  markApplied(key, { method: 'manual', note: args.slice(2).join(' ') || 'manual' });
  log(`Marked applied: ${key}`);
  process.exit(0);
}

if (cmd === 'mark-needs-human') {
  const key = args[1];
  if (!key) {
    console.error('Usage: mark-needs-human <vacancy-key> [note]');
    process.exit(1);
  }
  markNeedsHuman(key, args.slice(2).join(' ') || 'manual');
  log(`Marked needs_human: ${key}`);
  process.exit(0);
}

if (cmd === 'reset-db-test') {
  resetDbForTests();
  log('DB reset (tests only)');
  process.exit(0);
}

log(`job-hub CLI

Commands:
  scan [--fixture path] [--fresh] [--channel=name] ...     — ingest + fit + queue (--fresh = переиграть те же посты)
  run-cycle                                              — scan всех источников + apply (если AUTO_APPLY)
  apply-next [n]                                         — обработать n вакансий из очереди
  queue                                                  — показать очередь
  queue release-stuck [minutes]                            — processing → queued (0 = все stuck)
  report                                                 — сводка + Telegram daily
  letter                                                 — показать cover letter
  mark-applied <key> [note]
  mark-needs-human <key> [note]
`);
