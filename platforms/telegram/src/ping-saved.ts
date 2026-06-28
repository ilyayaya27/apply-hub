/** Проверка: сообщение в «Избранное» + какой аккаунт залогинен. */
import "dotenv/config"
import { initRuntimeConfig, getRuntimeConfig } from "./config/loadConfig.ts"
import { connectTelegram, sendToSavedMessages } from "./services/telegram.ts"
import { logger } from "./services/logger.ts"

await initRuntimeConfig()
const cfg = getRuntimeConfig()

const client = await connectTelegram(cfg)
try {
  const me = await client.getMe()
  const who = [
    `JobHarvest ping ${new Date().toLocaleString("ru-RU")}`,
    "",
    `Аккаунт: ${me.firstName ?? ""} ${me.lastName ?? ""}`.trim(),
    me.username ? `@${me.username}` : "",
    me.phone ? `Телефон: ${me.phone}` : "",
    `user_id: ${me.id}`,
    "",
    "Если это не твой аккаунт — удали .telegram_session и войди заново.",
  ]
    .filter(Boolean)
    .join("\n")

  const messageId = await sendToSavedMessages(client, who, "ping", {
    maxAttempts: cfg.env.retryMaxAttempts,
    baseDelayMs: cfg.env.retryBaseMs,
    maxDelayMs: cfg.env.retryMaxMs,
  })

  console.log(`\nOK: сообщение отправлено в «Избранное», messageId=${messageId}`)
  console.log(`Проверь Saved Messages у: ${me.phone ?? me.username ?? me.id}\n`)
} finally {
  await new Promise((r) => setTimeout(r, 2000))
  await client.disconnect()
}
