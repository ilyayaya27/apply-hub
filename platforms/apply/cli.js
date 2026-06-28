#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { enqueueFromHarvestPost } from './lib/enqueue-from-harvest.js';
import { applyNext, getApplyStats } from './lib/apply-dispatcher.js';
import { buildAuditReport, formatAuditReport } from './lib/audit.js';
import { notifyHarvestHumanDigest } from './lib/notify-harvest-digest.js';

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
  const harvestPath = process.argv[3];
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

console.error(`Usage:
  cli.js enqueue-dry-run --stdin | fixture.json
  cli.js enqueue --stdin | fixture.json   (dryRun:false in JSON for live queue)
  cli.js apply-next [n]
  cli.js audit [harvest-latest.json] [--json]
  cli.js notify-harvest-digest [harvest-latest.json]
`);
process.exit(1);
