import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "bun:test"
import {
  writeHarvestReportCache,
  type HarvestReportCache,
} from "../src/services/harvest-report-cache.ts"

const sampleReport = (): HarvestReportCache => ({
  generatedAt: "2026-06-28T12:00:00.000Z",
  hours: 24,
  summary: {
    scanned: 10,
    strictMatched: 2,
    candidateMatched: 1,
    rejected: 7,
    dedupSkipped: 0,
    matched: 3,
    recordFailed: 0,
    channelsProcessed: 2,
    topRejectReasons: [{ reason: "exclude:foo", count: 5 }],
    topChannels: [{ chat: "@jobs", matched: 3 }],
    postLinks: ["https://t.me/jobs/1"],
  },
  matches: [{ postUrl: "https://t.me/jobs/1", chat: "@jobs", jobUrls: ["https://hh.ru/v/1"] }],
  applyDryRun: [],
  textReport: "JobHarvest · сбор за 24 ч",
})

describe("writeHarvestReportCache", () => {
  let dir = ""

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it("writes latest json and appends history jsonl", async () => {
    dir = await mkdtemp(join(tmpdir(), "harvest-cache-"))
    const latest = join(dir, "harvest-latest.json")
    const history = join(dir, "harvest-history.jsonl")

    await writeHarvestReportCache(latest, history, sampleReport())
    await writeHarvestReportCache(latest, history, {
      ...sampleReport(),
      generatedAt: "2026-06-28T13:00:00.000Z",
      summary: { ...sampleReport().summary, scanned: 20 },
    })

    const latestParsed = JSON.parse(await readFile(latest, "utf8")) as HarvestReportCache
    expect(latestParsed.summary.scanned).toBe(20)

    const historyLines = (await readFile(history, "utf8")).trim().split("\n")
    expect(historyLines).toHaveLength(2)
    expect(JSON.parse(historyLines[0]!).scanned).toBe(10)
    expect(JSON.parse(historyLines[1]!).scanned).toBe(20)
  })
})
