import { getRuntimeConfig } from "../config/loadConfig.ts"

type LogLevel = "debug" | "info" | "warn" | "error"

const logOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const safeSerializeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return { message: String(error) }
}

const shouldLog = (level: LogLevel): boolean => {
  const configured = getRuntimeConfig().env.logLevel
  return logOrder[level] >= logOrder[configured]
}

const toTextLine = (payload: Record<string, unknown>): string => {
  const { ts, level, event, ...rest } = payload
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : ""
  return `${ts} [${String(level)}] ${String(event)}${extra}`
}

const emit = (level: LogLevel, event: string, data: Record<string, unknown> = {}): void => {
  if (!shouldLog(level)) return

  const payload: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  }

  const format = getRuntimeConfig().env.logFormat
  if (format === "text") {
    const line = toTextLine(payload)
    if (level === "error") console.error(line)
    else if (level === "warn") console.warn(line)
    else console.info(line)
    return
  }

  const line = JSON.stringify(payload)
  if (level === "error") console.error(line)
  else if (level === "warn") console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (event: string, data: Record<string, unknown> = {}) => emit("debug", event, data),
  info: (event: string, data: Record<string, unknown> = {}) => emit("info", event, data),
  warn: (event: string, data: Record<string, unknown> = {}) => emit("warn", event, data),
  error: (event: string, error?: unknown, data: Record<string, unknown> = {}) =>
    emit("error", event, {
      ...data,
      ...(error !== undefined ? { error: safeSerializeError(error) } : {}),
    }),
}
