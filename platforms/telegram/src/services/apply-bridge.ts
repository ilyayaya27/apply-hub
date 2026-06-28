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
  queued: "[queued]",
  skip_external: "[skip hh/li]",
  skip_seen: "[dup]",
  skip_fit: "[fit]",
  needs_human: "[manual]",
  error: "[err]",
}

export const formatApplyDryRunLine = (line: ApplyDryRunLine): string =>
  `• ${line.label} [${line.route}] ${line.primaryUrl ?? "—"} — post ${line.postUrl}`

export const enqueueForPost = (opts: {
  applyRoot: string
  sourceId: string
  postId: string
  postUrl: string
  rawText: string
  links: string[]
  dryRun?: boolean
}): ApplyDryRunLine[] => {
  const cli = join(opts.applyRoot, "cli.js")
  const dryRun = opts.dryRun !== false
  const payload = JSON.stringify({
    sourceId: opts.sourceId,
    postId: opts.postId,
    postUrl: opts.postUrl,
    rawText: opts.rawText,
    links: opts.links,
    dryRun,
    skipFitCheck: true,
  })

  const subcmd = dryRun ? "enqueue-dry-run" : "enqueue"
  const proc = spawnSync("node", [cli, subcmd, "--stdin"], {
    input: payload,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })

  if (proc.status !== 0 || !proc.stdout?.trim()) {
    return [
      {
        postUrl: opts.postUrl,
        route: "unknown",
        action: "error",
        primaryUrl: null,
        label: actionLabel.error!,
      },
    ]
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

/** @deprecated use enqueueForPost with dryRun: true */
export const enqueueDryRunForPost = (opts: Parameters<typeof enqueueForPost>[0]) =>
  enqueueForPost({ ...opts, dryRun: true })

export const runApplyNextBatch = (opts: { applyRoot: string; max?: number }) => {
  const cli = join(opts.applyRoot, "cli.js")
  const n = Math.max(1, opts.max ?? 1)
  const proc = spawnSync("node", [cli, "apply-next", String(n)], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })
  if (proc.status !== 0 || !proc.stdout?.trim()) {
    return { ok: false, error: proc.stderr?.trim() || "apply-next failed", results: [] }
  }
  try {
    return JSON.parse(proc.stdout) as {
      ok: boolean
      results: unknown[]
      stats: { appliedToday: number; queueLeft: number }
    }
  } catch {
    return { ok: false, error: "invalid apply-next json", results: [] }
  }
}
