import type { TelegramClient } from "telegram"
import { getRuntimeConfig } from "../config/loadConfig.ts"
import { extractContacts } from "./contacts.ts"
import type { DedupStore } from "./dedup.ts"
import { buildDedupSnapshot } from "./dedup.ts"
import { logger } from "./logger.ts"
import { matchVacancy } from "./matcher.ts"
import {
  enqueueForPost,
  formatApplyDryRunLine,
  runApplyNextBatch,
  type ApplyDryRunLine,
} from "./apply-bridge.ts"
import { writeHarvestReportCache } from "./harvest-report-cache.ts"

export type HarvestDeps = {
  dedup: DedupStore
}

type HarvestLine = {
  postUrl: string
  chat: string
  jobUrls: string[]
}

export type HarvestSummary = {
  scanned: number
  strictMatched: number
  candidateMatched: number
  rejected: number
  dedupSkipped: number
  matched: number
  recordFailed: number
  reportPath: string | null
  channelsProcessed: number
  topRejectReasons: Array<{ reason: string; count: number }>
  topChannels: Array<{ chat: string; matched: number }>
  postLinks: string[]
}

const messageEpochSec = (message: { date?: unknown }): number | undefined => {
  const d = message.date
  if (d instanceof Date) return Math.floor(d.getTime() / 1000)
  if (typeof d === "number") {
    if (d > 2_000_000_000_000) return Math.floor(d / 1000)
    return d
  }
  if (typeof d === "string") {
    const parsed = Date.parse(d)
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000)
  }
  return undefined
}

const topFromMap = (data: Record<string, number>, limit = 5): Array<{ key: string; count: number }> =>
  Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }))

/** Ссылка на пост в канале (публичный @username → t.me/…/id). */
export const buildPostLink = (chat: string, messageId: number): string => {
  if (chat.startsWith("@")) return `https://t.me/${chat.slice(1)}/${messageId}`
  return `${chat}:${messageId}`
}

const HUMAN_ACTIONS = new Set(["needs_human"])
const HUMAN_ROUTES = new Set(["manual", "telegram", "rvc_bot"])

const isHumanApplyLine = (line: ApplyDryRunLine): boolean =>
  HUMAN_ACTIONS.has(line.action) || HUMAN_ROUTES.has(line.route)

export const formatHumanDigestBlock = (lines: ApplyDryRunLine[]): string => {
  const human = lines.filter(isHumanApplyLine)
  if (human.length === 0) return ""
  return ["👤 Ручная очередь (manual / TG / bot):", ...human.map(formatApplyDryRunLine)].join("\n")
}

const buildConsolidatedMessage = (
  hours: number,
  summary: Omit<HarvestSummary, "postLinks" | "topRejectReasons" | "topChannels" | "reportPath">,
  lines: HarvestLine[],
  topRejectReasons: HarvestSummary["topRejectReasons"],
  topChannels: HarvestSummary["topChannels"],
  applyDryRunLines: ApplyDryRunLine[] = [],
  applyLive = false,
): string => {
  const reasons =
    topRejectReasons.length === 0
      ? "(нет)"
      : topRejectReasons.map((r) => `• ${r.reason}: ${r.count}`).join("\n")

  const channels =
    topChannels.length === 0
      ? "(нет)"
      : topChannels.map((c) => `• ${c.chat}: ${c.matched}`).join("\n")

  const postUrls = lines.map((l) => l.postUrl)
  const jobUrls = [...new Set(lines.flatMap((l) => l.jobUrls))]

  const linksHint =
    postUrls.length === 0
      ? "(нет — за окно ничего не прошло фильтр; чаще всего нужны слова из includeAny в src/config/matcher-rules.json)"
      : postUrls.join("\n")

  const parts: string[] = [
    `JobHarvest · сбор за ${hours} ч`,
    "",
    `Проверено сообщений: ${summary.scanned}`,
    `Найдено по фильтру: ${lines.length} (strict: ${summary.strictMatched}, candidate: ${summary.candidateMatched})`,
    `Отклонено фильтром: ${summary.rejected}`,
    `Пропущено (дубли URL): ${summary.dedupSkipped}`,
    `Ошибки записи: ${summary.recordFailed}`,
    `Каналов: ${summary.channelsProcessed}`,
    "",
    "Ссылки на посты в Telegram (открывай по очереди):",
    linksHint,
  ]

  if (jobUrls.length > 0) {
    parts.push("", "Ссылки на площадки из текста постов (hh, djinni, …):", jobUrls.join("\n"))
  }

  if (applyDryRunLines.length > 0) {
    parts.push(
      "",
      applyLive ? "📋 Apply queue (live)" : "📋 Dry-run apply (0 реальных откликов)",
      ...applyDryRunLines.map(formatApplyDryRunLine),
    )
    const humanBlock = formatHumanDigestBlock(applyDryRunLines)
    if (humanBlock) parts.push("", humanBlock)
  }

  parts.push(
    "",
    "Топ причин отклонения:",
    reasons,
    "",
    "Топ каналов по матчам:",
    channels,
  )

  return parts.join("\n")
}

const extractLinksFromText = (fullText: string, jobUrls: string[]): string[] =>
  [
    ...new Set([
      ...jobUrls,
      ...(fullText.match(/\bhttps?:\/\/[^\s<>()]+[^\s<>().,:;!?]/giu) ?? []),
    ]),
  ]

const recordMatch = async (
  chat: string,
  messageId: number,
  fullText: string,
  snapshot: ReturnType<typeof buildDedupSnapshot>,
  deps: HarvestDeps,
  lines: HarvestLine[],
  applyDryRunLines: ApplyDryRunLine[],
): Promise<void> => {
  const postUrl = buildPostLink(chat, messageId)
  const jobUrls = extractContacts(fullText)
    .filter((c) => c.kind === "job_url")
    .map((c) => c.value)
  lines.push({ postUrl, chat, jobUrls })
  await deps.dedup.mark(snapshot)

  const cfg = getRuntimeConfig()
  if (cfg.env.applyEnabled) {
    const sourceId = `telegram:${chat.replace(/^@/, "")}`
    applyDryRunLines.push(
      ...enqueueForPost({
        applyRoot: cfg.env.applyRoot,
        sourceId,
        postId: String(messageId),
        postUrl,
        rawText: fullText,
        links: extractLinksFromText(fullText, jobUrls),
        dryRun: cfg.env.applyDryRun,
      }),
    )
  }
}

export const runHarvest = async (
  client: TelegramClient,
  deps: HarvestDeps,
  chats: string[],
): Promise<HarvestSummary> => {
  const cfg = getRuntimeConfig()
  const hours = cfg.env.harvestHours
  const cutoffEpoch = Math.floor(Date.now() / 1000) - hours * 3600

  const rejectReasons: Record<string, number> = {}
  const matchedPerChat: Record<string, number> = {}
  const lines: HarvestLine[] = []
  const applyDryRunLines: ApplyDryRunLine[] = []

  const summary: HarvestSummary = {
    scanned: 0,
    strictMatched: 0,
    candidateMatched: 0,
    rejected: 0,
    dedupSkipped: 0,
    matched: 0,
    recordFailed: 0,
    reportPath: null,
    channelsProcessed: 0,
    topRejectReasons: [],
    topChannels: [],
    postLinks: [],
  }

  logger.info("harvest.started", {
    hours,
    chatsCount: chats.length,
    maxPerChat: cfg.env.harvestMaxPerChat,
  })

  for (const chat of chats) {
    let matchedInChat = 0

    try {
      const messages = await client.getMessages(chat, { limit: cfg.env.harvestMaxPerChat })

      for (const message of messages) {
        if (!message || typeof message !== "object") continue
        const epochSec = messageEpochSec(message as { date?: unknown })
        if (!epochSec) continue
        if (epochSec < cutoffEpoch) break

        const messageId = Number((message as { id?: unknown }).id)
        if (!Number.isFinite(messageId)) continue

        const rawText = (message as { message?: unknown }).message
        const fullText = typeof rawText === "string" ? rawText : ""
        if (!fullText.trim()) continue

        summary.scanned += 1

        const snapshot = buildDedupSnapshot(chat, messageId, fullText)
        // Не используем hasMessage: после первого прогона старый бот/harvest пометил
        // все id в .seen_store — иначе каждый новый запуск молча пропускает сотни постов
        // (матчер даже не вызывается), хотя вакансии в окне те же.

        const match = matchVacancy(fullText, cfg.matcher, cfg.env.matchMode)

        if (cfg.env.debugDecisionLogs) {
          logger.debug("harvest.decision", {
            chat,
            messageId,
            decision: match.decision,
            reasons: match.reasons,
          })
        }

        if (match.decision === "reject") {
          summary.rejected += 1
          const reason = match.reasons[0] ?? "reject:unknown"
          rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1
          continue
        }

        if (await deps.dedup.shouldSkipUrls(snapshot)) {
          summary.dedupSkipped += 1
          await deps.dedup.mark(snapshot)
          continue
        }

        if (match.decision === "strict_match") summary.strictMatched += 1
        else summary.candidateMatched += 1

        try {
          await recordMatch(chat, messageId, fullText, snapshot, deps, lines, applyDryRunLines)
          summary.matched += 1
          matchedInChat += 1
        } catch (error) {
          summary.recordFailed += 1
          logger.error("harvest.record.failed", error, { chat, messageId })
        }
      }
    } catch (error) {
      logger.error("harvest.chat.failed", error, { chat })
    }

    summary.channelsProcessed += 1
    if (matchedInChat > 0) matchedPerChat[chat] = matchedInChat

    logger.info("harvest.progress", {
      chat,
      matchedInChat,
      channelsProcessed: summary.channelsProcessed,
      chatsTotal: chats.length,
    })
  }

  summary.topRejectReasons = topFromMap(rejectReasons).map((x) => ({
    reason: x.key,
    count: x.count,
  }))
  summary.topChannels = topFromMap(matchedPerChat).map((x) => ({
    chat: x.key,
    matched: x.count,
  }))

  const uniqueLines = [...new Map(lines.map((l) => [l.postUrl, l])).values()]
  summary.postLinks = uniqueLines.map((l) => l.postUrl)

  const textReport = buildConsolidatedMessage(
    hours,
    {
      scanned: summary.scanned,
      strictMatched: summary.strictMatched,
      candidateMatched: summary.candidateMatched,
      rejected: summary.rejected,
      dedupSkipped: summary.dedupSkipped,
      matched: uniqueLines.length,
      recordFailed: summary.recordFailed,
      channelsProcessed: summary.channelsProcessed,
    },
    uniqueLines,
    summary.topRejectReasons,
    summary.topChannels,
    applyDryRunLines,
    cfg.env.applyEnabled && !cfg.env.applyDryRun,
  )

  if (cfg.env.applyEnabled && !cfg.env.applyDryRun && cfg.env.autoApply) {
    const batch = runApplyNextBatch({
      applyRoot: cfg.env.applyRoot,
      max: cfg.env.applyBatchMax,
    })
    logger.info("harvest.apply.batch", {
      ok: batch.ok,
      processed: batch.results?.length ?? 0,
      stats: "stats" in batch ? batch.stats : undefined,
    })
  }

  try {
    await writeHarvestReportCache(cfg.env.harvestReportPath, cfg.env.harvestHistoryPath, {
      generatedAt: new Date().toISOString(),
      hours,
      summary: {
        scanned: summary.scanned,
        strictMatched: summary.strictMatched,
        candidateMatched: summary.candidateMatched,
        rejected: summary.rejected,
        dedupSkipped: summary.dedupSkipped,
        matched: uniqueLines.length,
        recordFailed: summary.recordFailed,
        channelsProcessed: summary.channelsProcessed,
        topRejectReasons: summary.topRejectReasons,
        topChannels: summary.topChannels,
        postLinks: summary.postLinks,
      },
      matches: uniqueLines,
      applyDryRun: applyDryRunLines,
      textReport,
    })
    summary.reportPath = cfg.env.harvestReportPath
    logger.info("harvest.report.cached", { path: summary.reportPath })
  } catch (error) {
    summary.recordFailed += 1
    logger.error("harvest.report.cache.failed", error, { path: cfg.env.harvestReportPath })
  }

  logger.info("harvest.completed", summary)
  return summary
}
