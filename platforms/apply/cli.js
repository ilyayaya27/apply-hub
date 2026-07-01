#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { enqueueFromHarvestPost } from './lib/enqueue-from-harvest.js';
import { applyNext, getApplyStats } from './lib/apply-dispatcher.js';
import { buildAuditReport, formatAuditReport } from './lib/audit.js';
import { notifyHarvestHumanDigest } from './lib/notify-harvest-digest.js';
import { repairResumePosts } from './lib/repair-resume.js';
import { repairCareerRoutes } from './lib/repair-career-routes.js';
import { applyViaForm } from './workers/form-apply.js';
import { applyRvcGlobal } from './workers/rvc-global.js';
import { runGetmatch } from './workers/getmatch.js';
import { runHnHiring } from './workers/hn-hiring.js';
import { CAREER_SMOKE_PROBES } from './lib/career-smoke-probes.js';
import { careerPlatformId } from './adapters/platforms/hosts.js';

const cmd = process.argv[2];

const readJsonInput = () => {
  const useStdin = process.argv.includes('--stdin');
  const raw = useStdin
    ? readFileSync(0, 'utf8')
    : readFileSync(process.argv[3], 'utf8');
  return JSON.parse(raw);
};

if (cmd === 'enqueue-dry-run' || cmd === 'enqueue') {
  const input = readJsonInput();
  const dryRun = cmd === 'enqueue-dry-run' ? true : input.dryRun !== false;
  const out = enqueueFromHarvestPost({ ...input, dryRun });
  console.log(JSON.stringify(out));
  process.exit(out.ok ? 0 : 1);
}

if (cmd === 'apply-next') {
  const n = Math.max(1, Number(process.argv[3] ?? 1));
  const results = [];
  for (let i = 0; i < n; i += 1) {
    const next = await applyNext();
    if (!next) break;
    results.push(next);
  }
  console.log(JSON.stringify({ ok: true, results, stats: getApplyStats() }));
  process.exit(0);
}

if (cmd === 'audit') {
  const harvestPath = process.argv.slice(3).find((a) => !a.startsWith('-'));
  const report = buildAuditReport(harvestPath ? { harvestPath } : {});
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatAuditReport(report));
  }
  process.exit(0);
}

if (cmd === 'notify-harvest-digest') {
  const harvestPath = process.argv[3];
  const out = await notifyHarvestHumanDigest(harvestPath);
  console.log(JSON.stringify(out));
  process.exit(out.ok ? 0 : 1);
}

if (cmd === 'repair-resume') {
  const apply = process.argv.includes('--apply');
  const out = repairResumePosts({ dryRun: !apply });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (cmd === 'repair-career-routes') {
  const apply = process.argv.includes('--apply');
  const out = repairCareerRoutes({ dryRun: !apply });
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (cmd === 'rvc-global-apply') {
  const dryRun = process.argv.includes('--dry-run') || process.env.APPLY_DRY_RUN === '1';
  const limit = Number(process.argv.slice(3).find((a) => /^\d+$/.test(a)) ?? 50);
  const out = await applyRvcGlobal({ dryRun, limit });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

if (cmd === 'getmatch-apply') {
  const limit = Number(process.argv.slice(3).find((a) => /^\d+$/.test(a)) ?? 10);
  const out = await runGetmatch({ limit });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

if (cmd === 'hn-apply') {
  const limit = Number(process.argv.slice(3).find((a) => /^\d+$/.test(a)) ?? 20);
  const dryRun = process.argv.includes('--dry-run') || process.env.APPLY_DRY_RUN === '1';
  const out = await runHnHiring({ limit, dryRun });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

if (cmd === 'career-smoke') {
  const runAll = process.argv.includes('--all');
  const urlArg = process.argv.slice(3).find((a) => !a.startsWith('-'));

  /** @type {{ url: string, platformId?: string }[]} */
  const targets = runAll
    ? CAREER_SMOKE_PROBES
    : urlArg
      ? [{ url: urlArg, platformId: careerPlatformId(urlArg) ?? undefined }]
      : [];

  if (targets.length === 0) {
    console.error('Usage: cli.js career-smoke <vacancy-url> | career-smoke --all');
    process.exit(1);
  }

  /** @type {unknown[]} */
  const results = [];
  for (const { url, platformId } of targets) {
    const out = await applyViaForm({ url, primaryUrl: url, title: 'Career smoke', company: 'Smoke' });
    const row = { url, platformId: platformId ?? careerPlatformId(url), ...out };
    results.push(row);
    console.log(JSON.stringify(row, null, 2));
    if (!out.ok) process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, count: results.length, results }, null, 2));
  process.exit(0);
}

console.error(`Usage:
  cli.js enqueue-dry-run --stdin | fixture.json
  cli.js enqueue --stdin | fixture.json   (dryRun:false in JSON for live queue)
  cli.js apply-next [n]
  cli.js audit [harvest-latest.json] [--json]
  cli.js notify-harvest-digest [harvest-latest.json]
  cli.js repair-resume [--apply]
  cli.js repair-career-routes [--apply]
  cli.js career-smoke <vacancy-url> | career-smoke --all
  cli.js rvc-global-apply [limit] [--dry-run]
`);
process.exit(1);
