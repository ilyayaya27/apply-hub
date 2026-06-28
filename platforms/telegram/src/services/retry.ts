import { logger } from "./logger.ts"

export type RetryOptions = {
  label: string
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  isRetryable?: (error: unknown) => boolean
}

const defaultRetryable = (error: unknown): boolean => {
  const text = String(error)
  const keywords = [
    "timeout",
    "timed out",
    "econnreset",
    "ehostunreach",
    "enetunreach",
    "ecanceled",
    "flood",
    "temporary",
    "network",
  ]
  const lower = text.toLowerCase()
  return keywords.some((k) => lower.includes(k))
}

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

export const withRetry = async <T>(
  action: () => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  const isRetryable = options.isRetryable ?? defaultRetryable

  let lastError: unknown
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        logger.warn("retry.attempt", {
          label: options.label,
          attempt,
          maxAttempts: options.maxAttempts,
        })
      }
      return await action()
    } catch (error) {
      lastError = error
      if (attempt >= options.maxAttempts || !isRetryable(error)) {
        throw error
      }

      const exp = options.baseDelayMs * 2 ** (attempt - 1)
      const jitter = Math.floor(Math.random() * 200)
      const waitMs = Math.min(options.maxDelayMs, exp + jitter)

      logger.warn("retry.wait", {
        label: options.label,
        attempt,
        waitMs,
      })

      await sleep(waitMs)
    }
  }

  throw lastError
}
