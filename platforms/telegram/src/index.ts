import "dotenv/config"
import { getRuntimeConfig, initRuntimeConfig } from "./config/loadConfig.ts"
import { DedupStore } from "./services/dedup.ts"
import { runHarvest } from "./services/harvest.ts"
import { logger } from "./services/logger.ts"
import { connectTelegram, resolveMonitoredChats } from "./services/telegram.ts"

const parseHoursArg = (): number | undefined => {
  const idx = process.argv.indexOf("--hours")
  if (idx === -1) return undefined
  const raw = process.argv[idx + 1]
  if (!raw) return undefined
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

const hoursOverride = parseHoursArg()

await initRuntimeConfig(hoursOverride)
const cfg = getRuntimeConfig()

const deps = {
  dedup: new DedupStore(cfg.channels.seenStorePath, cfg.channels.dedupMaxEntries),
}

logger.info("harvest.app.starting", {
  matchMode: cfg.env.matchMode,
  harvestHours: cfg.env.harvestHours,
  hoursFromCli: hoursOverride !== undefined,
})

const client = await connectTelegram(cfg)
try {
  const chats = await resolveMonitoredChats(client, cfg.channels.chats)
  logger.info("harvest.chats.resolved", { count: chats.length, chats })

  const summary = await runHarvest(client, deps, chats)
  logger.info("harvest.app.done", {
    matches: summary.matched,
    reportPath: summary.reportPath,
    scanned: summary.scanned,
  })
} catch (error) {
  logger.error("harvest.app.failed", error)
  process.exitCode = 1
} finally {
  await new Promise((r) => setTimeout(r, 2000))
  await client.disconnect()
  logger.info("harvest.app.disconnected")
}
