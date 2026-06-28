import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { pathExists, readUtf8 } from "../utils/io.ts"
import { parseProxyUrl, proxyLabel, resolveProxyUrl } from "./parseProxy.ts"
import type { AppEnv, ChannelsConfig, MatcherRules, RuntimeConfig } from "./types.ts"

const parseIntSafe = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === "") return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

const parseBool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === "") return fallback
  return ["1", "true", "yes", "on"].includes(value.toLowerCase())
}

const parseLogLevel = (value: string | undefined): AppEnv["logLevel"] => {
  if (value === "debug" || value === "info" || value === "warn" || value === "error") return value
  return "info"
}

const parseLogFormat = (value: string | undefined): AppEnv["logFormat"] => {
  if (value === "text" || value === "json") return value
  return "json"
}

const parseMatchMode = (value: string | undefined): AppEnv["matchMode"] => {
  if (value === "strict" || value === "dual") return value
  return "dual"
}

export const loadEnv = (): AppEnv => {
  const apiIdRaw = process.env.TELEGRAM_API_ID
  const apiHash = process.env.TELEGRAM_API_HASH
  if (!apiIdRaw || !apiHash) {
    throw new Error("Missing TELEGRAM_API_ID or TELEGRAM_API_HASH")
  }
  const telegramApiId = Number.parseInt(apiIdRaw, 10)
  if (!Number.isFinite(telegramApiId)) {
    throw new Error("TELEGRAM_API_ID must be a number")
  }

  const proxyUrl = resolveProxyUrl()
  const telegramProxy = proxyUrl ? parseProxyUrl(proxyUrl) : undefined
  if (proxyUrl && !telegramProxy) {
    throw new Error(
      `Invalid proxy URL (GramJS needs socks4/socks5): ${proxyUrl}. Set TELEGRAM_PROXY_URL=socks5://127.0.0.1:10808`,
    )
  }

  return {
    telegramApiId,
    telegramApiHash: apiHash,
    sessionFile: process.env.SESSION_FILE ?? ".telegram_session",
    telegramPhone: process.env.TELEGRAM_PHONE,
    channelsConfigPath: resolve(
      process.cwd(),
      process.env.CHANNELS_CONFIG_PATH ?? "src/config/channels.json",
    ),
    matcherRulesPath: resolve(
      process.cwd(),
      process.env.MATCHER_RULES_PATH ?? "src/config/matcher-rules.json",
    ),
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    logFormat: parseLogFormat(process.env.LOG_FORMAT),
    matchMode: parseMatchMode(process.env.MATCH_MODE),
    debugDecisionLogs: parseBool(process.env.DEBUG_DECISION_LOGS, false),
    retryMaxAttempts: parseIntSafe(process.env.RETRY_MAX_ATTEMPTS, 4),
    retryBaseMs: parseIntSafe(process.env.RETRY_BASE_MS, 700),
    retryMaxMs: parseIntSafe(process.env.RETRY_MAX_MS, 10000),
    harvestHours: parseIntSafe(process.env.HARVEST_HOURS, 24),
    harvestMaxPerChat: parseIntSafe(process.env.HARVEST_MAX_PER_CHAT, 300),
    telegramProxy,
    telegramProxyLabel: telegramProxy ? proxyLabel(telegramProxy) : undefined,
    // GramJS: WSS + proxy together is unsupported
    telegramUseWss: telegramProxy
      ? false
      : parseBool(process.env.TELEGRAM_USE_WSS, true),
    telegramForceSms: parseBool(process.env.TELEGRAM_FORCE_SMS, false),
    applyEnabled: process.env.APPLY_ENABLED === "1",
    applyDryRun: process.env.APPLY_DRY_RUN !== "0",
    autoApply: process.env.AUTO_APPLY === "1",
    applyBatchMax: parseIntSafe(process.env.APPLY_BATCH_MAX, 5),
    applyRoot: resolve(
      process.cwd(),
      process.env.APPLY_ROOT ??
        join(dirname(fileURLToPath(import.meta.url)), "../../../apply"),
    ),
    harvestReportPath: resolve(
      process.cwd(),
      process.env.HARVEST_REPORT_PATH ?? "logs/harvest-latest.json",
    ),
    harvestHistoryPath: resolve(
      process.cwd(),
      process.env.HARVEST_HISTORY_PATH ?? "logs/harvest-history.jsonl",
    ),
  }
}

export const readChannelsConfig = async (path: string): Promise<ChannelsConfig> => {
  if (!(await pathExists(path))) {
    throw new Error(
      `Channels config not found at ${path}. Copy src/config/channels.example.json to src/config/channels.json`,
    )
  }
  const parsed = JSON.parse(await readUtf8(path)) as ChannelsConfig
  if (!Array.isArray(parsed.chats) || parsed.chats.length === 0) {
    throw new Error("channels.json: chats must be a non-empty array of @usernames or channel ids")
  }
  return {
    chats: parsed.chats,
    pitchTemplate:
      parsed.pitchTemplate ?? "Привет! Заинтересовала вакансия.\n\nРезюме: {{resumeUrl}}",
    resumeUrl: parsed.resumeUrl ?? "",
    notifyThrottlePerMinute: parsed.notifyThrottlePerMinute ?? 12,
    dedupMaxEntries: parsed.dedupMaxEntries ?? 5000,
    seenStorePath: resolve(process.cwd(), parsed.seenStorePath ?? ".seen_store.json"),
  }
}

export const readMatcherRules = async (path: string): Promise<MatcherRules> => {
  if (!(await pathExists(path))) {
    throw new Error(`Matcher rules not found at ${path}`)
  }
  const parsed = JSON.parse(await readUtf8(path)) as MatcherRules
  return {
    includeAny: parsed.includeAny ?? [],
    levelAny: parsed.levelAny ?? [],
    excludeAny: parsed.excludeAny ?? [],
  }
}

export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
  const env = loadEnv()
  const [channels, matcher] = await Promise.all([
    readChannelsConfig(env.channelsConfigPath),
    readMatcherRules(env.matcherRulesPath),
  ])
  return { env, channels, matcher }
}

let cached: RuntimeConfig | undefined

export const getRuntimeConfig = (): RuntimeConfig => {
  if (!cached) {
    throw new Error("Runtime config not initialized")
  }
  return cached
}

export const initRuntimeConfig = async (hoursOverride?: number): Promise<RuntimeConfig> => {
  const cfg = await loadRuntimeConfig()
  if (hoursOverride !== undefined && Number.isFinite(hoursOverride) && hoursOverride > 0) {
    cfg.env.harvestHours = hoursOverride
  }
  cached = cfg
  return cfg
}
