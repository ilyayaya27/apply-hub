export type MatchMode = "strict" | "dual"

export type MatcherRules = {
  includeAny: string[]
  levelAny: string[]
  excludeAny: string[]
}

export type ChannelsConfig = {
  chats: string[]
  pitchTemplate: string
  resumeUrl: string
  notifyThrottlePerMinute: number
  dedupMaxEntries: number
  seenStorePath: string
}

export type TelegramProxy = {
  ip: string
  port: number
  socksType: 4 | 5
  username?: string
  password?: string
}

export type AppEnv = {
  telegramApiId: number
  telegramApiHash: string
  sessionFile: string
  telegramPhone?: string
  /** SOCKS proxy for MTProto (GramJS). WSS disabled when set. */
  telegramProxy?: TelegramProxy
  telegramProxyLabel?: string
  channelsConfigPath: string
  matcherRulesPath: string
  logLevel: "debug" | "info" | "warn" | "error"
  logFormat: "json" | "text"
  matchMode: MatchMode
  debugDecisionLogs: boolean
  retryMaxAttempts: number
  retryBaseMs: number
  retryMaxMs: number
  harvestHours: number
  harvestMaxPerChat: number
  /** Порт 443 (WSS) — стабильнее, если обрывается TCP на 80 */
  telegramUseWss: boolean
  /** Запросить код по SMS, если не приходит в приложение Telegram */
  telegramForceSms: boolean
  applyEnabled: boolean
  applyDryRun: boolean
  /** После harvest вызывать apply-next (только при APPLY_DRY_RUN=0) */
  autoApply: boolean
  applyBatchMax: number
  applyRoot: string
  harvestReportPath: string
  harvestHistoryPath: string
}

export type RuntimeConfig = {
  env: AppEnv
  channels: ChannelsConfig
  matcher: MatcherRules
}
