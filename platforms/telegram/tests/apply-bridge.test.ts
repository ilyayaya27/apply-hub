import { describe, expect, it } from "bun:test"
import { join } from "node:path"
import {
  enqueueDryRunForPost,
  enqueueForPost,
  formatApplyDryRunLine,
} from "../src/services/apply-bridge.ts"

const applyRoot = join(import.meta.dir, "../../apply")

describe("apply-bridge", () => {
  it("returns error line when cli missing", () => {
    const lines = enqueueDryRunForPost({
      applyRoot: "/tmp/apply-hub-missing-cli-root",
      sourceId: "telegram:x",
      postId: "1",
      postUrl: "https://t.me/x/1",
      rawText: "test",
      links: [],
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.action).toBe("error")
    expect(lines[0]!.label).toBe("[err]")
  })

  it("classifies form URL via subprocess", () => {
    const postId = `bridge-${Date.now()}`
    const lines = enqueueDryRunForPost({
      applyRoot,
      sourceId: "telegram:test",
      postId,
      postUrl: `https://t.me/test/${postId}`,
      rawText: "Frontend\nApply: https://forms.gle/rvc-smoke-simple-form",
      links: ["https://forms.gle/rvc-smoke-simple-form"],
    })
    expect(lines[0]!.action).toBe("would_apply")
    expect(lines[0]!.route).toBe("form")
    expect(lines[0]!.label).toBe("[dry-run]")
  })

  it("live enqueue uses queued action", () => {
    const postId = `live-${Date.now()}`
    const lines = enqueueForPost({
      applyRoot,
      sourceId: "telegram:test",
      postId,
      postUrl: `https://t.me/test/${postId}`,
      rawText: "Frontend\nApply: https://forms.gle/rvc-smoke-live-form",
      links: ["https://forms.gle/rvc-smoke-live-form"],
      dryRun: false,
    })
    expect(lines[0]!.action).toBe("queued")
    expect(lines[0]!.route).toBe("form")
    expect(lines[0]!.label).toBe("[queued]")
  })

  it("formats dry-run line for report", () => {
    const line = formatApplyDryRunLine({
      postUrl: "https://t.me/c/1",
      route: "hh",
      action: "skip_external",
      primaryUrl: "https://hh.ru/vacancy/1",
      label: "[skip hh/li]",
    })
    expect(line).toContain("[skip hh/li]")
    expect(line).toContain("https://hh.ru/vacancy/1")
  })
})
