import { appendFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import { writeUtf8 } from "../utils/io.ts"
import type { ApplyDryRunLine } from "./apply-bridge.ts"

export type HarvestMatchLine = {
  postUrl: string
  chat: string
  jobUrls: string[]
}

export type HarvestReportSummary = {
  scanned: number
  strictMatched: number
  candidateMatched: number
  rejected: number
  dedupSkipped: number
  matched: number
  recordFailed: number
  channelsProcessed: number
  topRejectReasons: Array<{ reason: string; count: number }>
  topChannels: Array<{ chat: string; matched: number }>
  postLinks: string[]
}

export type HarvestReportCache = {
  generatedAt: string
  hours: number
  summary: HarvestReportSummary
  matches: HarvestMatchLine[]
  applyDryRun: ApplyDryRunLine[]
  textReport: string
}

export type HarvestHistoryEntry = {
  generatedAt: string
  hours: number
  scanned: number
  matched: number
  strictMatched: number
  candidateMatched: number
  rejected: number
  dedupSkipped: number
  recordFailed: number
  channelsProcessed: number
  applyDryRunCount: number
}

export const writeHarvestReportCache = async (
  reportPath: string,
  historyPath: string | undefined,
  data: HarvestReportCache,
): Promise<void> => {
  await mkdir(dirname(reportPath), { recursive: true })
  await writeUtf8(reportPath, `${JSON.stringify(data, null, 2)}\n`)

  if (!historyPath) return

  const entry: HarvestHistoryEntry = {
    generatedAt: data.generatedAt,
    hours: data.hours,
    scanned: data.summary.scanned,
    matched: data.summary.matched,
    strictMatched: data.summary.strictMatched,
    candidateMatched: data.summary.candidateMatched,
    rejected: data.summary.rejected,
    dedupSkipped: data.summary.dedupSkipped,
    recordFailed: data.summary.recordFailed,
    channelsProcessed: data.summary.channelsProcessed,
    applyDryRunCount: data.applyDryRun.length,
  }
  await appendFile(historyPath, `${JSON.stringify(entry)}\n`, "utf8")
}
