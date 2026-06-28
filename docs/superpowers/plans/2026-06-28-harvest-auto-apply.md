# Harvest Auto-Apply (Dry-Run) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After Telegram harvest matches a post, classify job URLs by apply route and append a dry-run section to the Saved Messages report — without real applies; HH/LinkedIn skipped.

**Architecture:** Vendor `rvc-applicant/lib/` into `platforms/apply/`. Harvest (Bun/TS) calls `node platforms/apply/cli.js enqueue-dry-run` via subprocess with JSON stdin/stdout. SQLite dedup lives in Node only.

**Tech Stack:** Bun (harvest), Node ESM (apply), better-sqlite3, vitest (apply tests), bun test (telegram bridge).

**Spec:** `docs/superpowers/specs/2026-06-28-harvest-auto-apply-design.md`

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `platforms/apply/package.json` | Create | Node module root, test script |
| `platforms/apply/cli.js` | Create (from rvc) | CLI + `enqueue-dry-run` |
| `platforms/apply/lib/*.js` | Create (vendor) | router, pipeline, store, db, config, letter |
| `platforms/apply/lib/enqueue-from-harvest.js` | Create | Single-post enqueue logic for CLI |
| `platforms/apply/tests/router.test.js` | Create | URL → route |
| `platforms/apply/tests/enqueue-dry-run.integration.test.js` | Create | CLI boundary test |
| `platforms/apply/tests/skip-external.test.js` | Create | hh/li never would_apply |
| `platforms/telegram/src/services/apply-bridge.ts` | Create | spawn CLI, parse stdout |
| `platforms/telegram/src/config/types.ts` | Modify | APPLY_* env fields |
| `platforms/telegram/src/config/loadConfig.ts` | Modify | parse APPLY_* |
| `platforms/telegram/src/services/harvest.ts` | Modify | hook + report section |
| `platforms/telegram/tests/apply-bridge.test.ts` | Create | mock subprocess |
| `platforms/telegram/.env.example` | Modify | document env |
| `platforms/apply/README.md` | Create | usage |
| `.gitignore` | Modify | `platforms/apply/data/` |

---

### Task 1: Bootstrap `platforms/apply`

**Files:**
- Create: `platforms/apply/package.json`
- Create: `platforms/apply/.gitignore`
- Modify: `/home/alice/Documents/apply-hub/.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@apply-hub/apply",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.1"
  },
  "devDependencies": {
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create platforms/apply/.gitignore**

```
data/
node_modules/
```

- [ ] **Step 3: Add to repo root .gitignore**

```
platforms/apply/data/
platforms/apply/node_modules/
```

- [ ] **Step 4: Install deps**

Run: `cd /home/alice/Documents/apply-hub/platforms/apply && npm install`  
Expected: `node_modules/` created, no errors

- [ ] **Step 5: Commit**

```bash
git add platforms/apply/package.json platforms/apply/.gitignore .gitignore
git commit -m "chore(apply): bootstrap platforms/apply package"
```

---

### Task 2: Vendor rvc-applicant lib

**Files:**
- Create: `platforms/apply/lib/` (copy from rvc-applicant)

- [ ] **Step 1: Copy lib files**

Run:
```bash
cp -a /home/alice/Documents/rvc-applicant/lib/. /home/alice/Documents/apply-hub/platforms/apply/lib/
```

- [ ] **Step 2: Trim config.js defaults for apply-hub**

Modify `platforms/apply/lib/config.js` — set defaults:

```javascript
export const config = {
  // ...existing fields...
  dbPath: process.env.JOB_HUB_DB ?? join(root, 'data', 'vacancies.db'),
  coverLetterPath: process.env.COVER_LETTER_PATH ?? join(root, '../../letter.txt'),
  autoApply: process.env.AUTO_APPLY === '1',
  dryRun: process.env.APPLY_DRY_RUN !== '0', // default true
};
```

Ensure `root` resolves to `platforms/apply/` (dirname of cli.js parent).

- [ ] **Step 3: Verify letter path resolves**

Run: `node -e "import('./lib/letter.js').then(m => console.log(m.loadCoverLetter()))"` from `platforms/apply`  
Expected: first line of `letter.txt` or clear file-not-found (fix path if needed)

- [ ] **Step 4: Commit**

```bash
git add platforms/apply/lib
git commit -m "chore(apply): vendor job-hub lib from rvc-applicant"
```

---

### Task 3: Router tests (port)

**Files:**
- Create: `platforms/apply/tests/router.test.js`
- Create: `platforms/apply/vitest.config.js`

- [ ] **Step 1: vitest.config.js**

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 2: Write router.test.js**

```javascript
import { describe, expect, it } from 'vitest';
import { classifyApplyRoute } from '../lib/router.js';

describe('classifyApplyRoute', () => {
  it('routes hh to skip external', () => {
    const r = classifyApplyRoute({
      text: 'Frontend https://hh.ru/vacancy/123',
      links: ['https://hh.ru/vacancy/123'],
    });
    expect(r.route).toBe('hh');
  });

  it('routes linkedin to skip external', () => {
    const r = classifyApplyRoute({
      text: 'Job https://www.linkedin.com/jobs/view/1',
      links: ['https://www.linkedin.com/jobs/view/1'],
    });
    expect(r.route).toBe('linkedin');
  });

  it('routes google form to form', () => {
    const r = classifyApplyRoute({
      text: 'Apply https://forms.gle/abc123',
      links: ['https://forms.gle/abc123'],
    });
    expect(r.route).toBe('form');
  });

  it('routes email in text', () => {
    const r = classifyApplyRoute({
      text: 'Send CV to hr@company.com',
      links: [],
    });
    expect(r.route).toBe('email');
    expect(r.primaryUrl).toMatch(/@/);
  });

  it('falls back to manual for djinni', () => {
    const r = classifyApplyRoute({
      text: 'https://djinni.co/jobs/12345-frontend/',
      links: ['https://djinni.co/jobs/12345-frontend/'],
    });
    expect(r.route).toBe('manual');
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd platforms/apply && npm test`  
Expected: PASS (router tests only if others not added yet)

- [ ] **Step 4: Commit**

```bash
git add platforms/apply/tests/router.test.js platforms/apply/vitest.config.js
git commit -m "test(apply): port router classification tests"
```

---

### Task 4: `enqueue-from-harvest.js` + CLI command

**Files:**
- Create: `platforms/apply/lib/enqueue-from-harvest.js`
- Create: `platforms/apply/cli.js`

- [ ] **Step 1: Write enqueue-from-harvest.js**

```javascript
import { classifyApplyRoute } from './router.js';
import { processVacancyPost } from './pipeline.js';

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
```

- [ ] **Step 2: Write cli.js with enqueue-dry-run**

```javascript
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { enqueueFromHarvestPost } from './lib/enqueue-from-harvest.js';

const cmd = process.argv[2];

if (cmd === 'enqueue-dry-run') {
  const useStdin = process.argv.includes('--stdin');
  const raw = useStdin
    ? readFileSync(0, 'utf8')
    : readFileSync(process.argv[3], 'utf8');
  const input = JSON.parse(raw);
  const out = enqueueFromHarvestPost({ ...input, dryRun: true });
  console.log(JSON.stringify(out));
  process.exit(out.ok ? 0 : 1);
}

console.error('Usage: cli.js enqueue-dry-run --stdin  OR  cli.js enqueue-dry-run fixture.json');
process.exit(1);
```

- [ ] **Step 3: Commit**

```bash
git add platforms/apply/lib/enqueue-from-harvest.js platforms/apply/cli.js
git commit -m "feat(apply): enqueue-dry-run CLI for harvest bridge"
```

---

### Task 5: Integration test (CLI boundary)

**Files:**
- Create: `platforms/apply/tests/enqueue-dry-run.integration.test.js`
- Create: `platforms/apply/tests/fixtures/harvest-post-form.json`

- [ ] **Step 1: Fixture harvest-post-form.json**

```json
{
  "sourceId": "telegram:test_channel",
  "postId": "999",
  "postUrl": "https://t.me/test_channel/999",
  "rawText": "Frontend dev\nApply: https://forms.gle/rvc-smoke-simple-form\nhr@test.io",
  "links": ["https://forms.gle/rvc-smoke-simple-form"],
  "dryRun": true,
  "skipFitCheck": true
}
```

- [ ] **Step 2: Integration test**

```javascript
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resetDbForTests } from '../lib/db.js';

const root = join(fileURLToPath(import.meta.url), '../..');
const fixture = join(root, 'tests/fixtures/harvest-post-form.json');

describe('enqueue-dry-run CLI boundary', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-hub-enqueue-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    process.env.JOB_HUB_SKIP_STATE_MIGRATE = '1';
    resetDbForTests();
  });

  afterEach(() => {
    resetDbForTests();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    delete process.env.JOB_HUB_SKIP_STATE_MIGRATE;
  });

  it('returns would_apply for form URL', () => {
    const stdout = execFileSync('node', [join(root, 'cli.js'), 'enqueue-dry-run', fixture], {
      encoding: 'utf8',
      env: { ...process.env },
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.results[0].action).toBe('would_apply');
    expect(parsed.results[0].route).toBe('form');
  });
});
```

- [ ] **Step 3: skip-external.test.js**

```javascript
import { describe, expect, it } from 'vitest';
import { enqueueFromHarvestPost } from '../lib/enqueue-from-harvest.js';

describe('skip external routes', () => {
  it('hh never would_apply', () => {
    const out = enqueueFromHarvestPost({
      sourceId: 'telegram:x',
      postId: '1',
      postUrl: 'https://t.me/x/1',
      rawText: 'https://hh.ru/vacancy/1',
      links: ['https://hh.ru/vacancy/1'],
    });
    expect(out.results[0].action).toBe('skip_external');
    expect(out.results[0].route).toBe('hh');
  });
});
```

- [ ] **Step 4: Run tests**

Run: `cd platforms/apply && npm test`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add platforms/apply/tests platforms/apply/tests/fixtures
git commit -m "test(apply): enqueue-dry-run CLI integration boundary"
```

---

### Task 6: Telegram apply-bridge

**Files:**
- Create: `platforms/telegram/src/services/apply-bridge.ts`
- Create: `platforms/telegram/tests/apply-bridge.test.ts`

- [ ] **Step 1: apply-bridge.ts**

```typescript
import { spawnSync } from "node:child_process"
import { join } from "node:path"

export type ApplyDryRunLine = {
  postUrl: string
  route: string
  action: string
  primaryUrl: string | null
  label: string
}

const actionLabel: Record<string, string> = {
  would_apply: "[dry-run]",
  skip_external: "[skip hh/li]",
  skip_seen: "[dup]",
  skip_fit: "[fit]",
  needs_human: "[manual]",
  error: "[err]",
}

export const enqueueDryRunForPost = (opts: {
  applyRoot: string
  sourceId: string
  postId: string
  postUrl: string
  rawText: string
  links: string[]
}): ApplyDryRunLine[] => {
  const cli = join(opts.applyRoot, "cli.js")
  const payload = JSON.stringify({
    sourceId: opts.sourceId,
    postId: opts.postId,
    postUrl: opts.postUrl,
    rawText: opts.rawText,
    links: opts.links,
    dryRun: true,
    skipFitCheck: true,
  })

  const proc = spawnSync("node", [cli, "enqueue-dry-run", "--stdin"], {
    input: payload,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })

  if (proc.status !== 0 || !proc.stdout?.trim()) {
    return [{
      postUrl: opts.postUrl,
      route: "unknown",
      action: "error",
      primaryUrl: null,
      label: actionLabel.error!,
    }]
  }

  const parsed = JSON.parse(proc.stdout) as {
    ok: boolean
    results: Array<{
      action: string
      route: string
      primaryUrl: string | null
      postUrl?: string
    }>
  }

  return parsed.results.map((r) => ({
    postUrl: opts.postUrl,
    route: r.route,
    action: r.action,
    primaryUrl: r.primaryUrl,
    label: actionLabel[r.action] ?? `[${r.action}]`,
  }))
}
```

- [ ] **Step 2: apply-bridge.test.ts** — test with mocked spawn or fixture JSON parse (unit test `actionLabel` + error path when cli missing)

- [ ] **Step 3: Run bun test**

Run: `cd platforms/telegram && bun test tests/apply-bridge.test.ts`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add platforms/telegram/src/services/apply-bridge.ts platforms/telegram/tests/apply-bridge.test.ts
git commit -m "feat(telegram): apply-bridge subprocess wrapper"
```

---

### Task 7: Wire harvest + config

**Files:**
- Modify: `platforms/telegram/src/config/types.ts`
- Modify: `platforms/telegram/src/config/loadConfig.ts`
- Modify: `platforms/telegram/src/services/harvest.ts`
- Modify: `platforms/telegram/.env.example`

- [ ] **Step 1: Extend AppEnv in types.ts**

```typescript
  applyEnabled: boolean
  applyDryRun: boolean
  applyRoot: string
```

- [ ] **Step 2: Parse in loadConfig.ts**

```typescript
applyEnabled: process.env.APPLY_ENABLED === "1",
applyDryRun: process.env.APPLY_DRY_RUN !== "0",
applyRoot: process.env.APPLY_ROOT ?? join(import.meta.dir, "../../../apply"),
```

- [ ] **Step 3: In harvest.ts recordMatch** — if `cfg.env.applyEnabled`, call `enqueueDryRunForPost`, push to `applyDryRunLines` array passed by reference

- [ ] **Step 4: Extend buildConsolidatedMessage** — add section:

```
📋 Dry-run apply (0 реальных откликов)
• [dry-run] [form] https://forms.gle/… — post https://t.me/…
• [skip hh/li] [hh] https://hh.ru/… — post …
```

- [ ] **Step 5: .env.example**

```
# Apply pipeline after harvest (phase 1: dry-run only)
APPLY_ENABLED=0
APPLY_DRY_RUN=1
APPLY_ROOT=../apply
```

- [ ] **Step 6: Manual smoke**

Run: `APPLY_ENABLED=1 APPLY_DRY_RUN=1 ./telegram-harvest.sh`  
Expected: Saved Messages report includes dry-run section (or empty if no matches)

- [ ] **Step 7: Commit**

```bash
git add platforms/telegram/src/config platforms/telegram/src/services/harvest.ts platforms/telegram/.env.example
git commit -m "feat(telegram): harvest dry-run apply section via bridge"
```

---

### Task 8: Documentation

**Files:**
- Create: `platforms/apply/README.md`
- Modify: `platforms/telegram/README.md`
- Modify: `AGENTS.md` (one bullet)

- [ ] **Step 1: platforms/apply/README.md** — CLI usage, env, phases 1–3

- [ ] **Step 2: telegram README** — APPLY_ENABLED section

- [ ] **Step 3: AGENTS.md** — «Telegram harvest + APPLY_ENABLED=1 → dry-run в отчёте»

- [ ] **Step 4: Commit**

```bash
git add platforms/apply/README.md platforms/telegram/README.md AGENTS.md
git commit -m "docs: harvest auto-apply dry-run"
```

---

## Plan self-review vs spec

| Spec requirement | Task |
|------------------|------|
| Vendor lib in apply-hub | Task 2 |
| Subprocess JSON contract | Tasks 4, 5, 6 |
| HH/LI skip | Tasks 3, 5 |
| harvest hook | Task 7 |
| Report section | Task 7 |
| APPLY_* env | Task 7 |
| Integration test boundary | Task 5 |
| Phase 2 out of scope | Not in plan |
| Docs | Task 8 |

No placeholders remain in task steps.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-06-28-harvest-auto-apply.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you prefer?
