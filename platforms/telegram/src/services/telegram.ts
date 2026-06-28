import * as readline from "node:readline/promises"
import { Api } from "telegram"
import { TelegramClient } from "telegram"
import { generateRandomLong } from "telegram/Helpers.js"
import { StringSession } from "telegram/sessions/StringSession"
import type { RuntimeConfig } from "../config/types.ts"
import { pathExists, readUtf8, writeUtf8 } from "../utils/io.ts"
import { logger } from "./logger.ts"
import { withRetry } from "./retry.ts"

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

const promptLine = async (question: string): Promise<string> => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

const formatAuthError = (err: unknown): string => {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes("phone_number_flood") || lower.includes("flood")) {
    return `${msg}\n  → Слишком много попыток входа. Подожди 1–24 ч или используй: bun run login-qr`
  }
  if (lower.includes("phone_number_invalid")) {
    return `${msg}\n  → Номер в формате +79161234567 (международный, с +).`
  }
  if (lower.includes("phone_code_invalid")) {
    return `${msg}\n  → Код неверный или истёк. Запусти ping заново для нового кода.`
  }
  if (lower.includes("phone_code_expired")) {
    return `${msg}\n  → Код протух. Запусти ./telegram-ping.sh снова.`
  }
  return msg
}

const logAuthError = (err: unknown): boolean => {
  console.error(`\nОшибка Telegram: ${formatAuthError(err)}\n`)
  logger.error("telegram.start.error", err)
  return false
}

const promptPhoneCode = async (isCodeViaApp?: boolean): Promise<string> => {
  if (isCodeViaApp) {
    console.log(
      "\nКод отправлен в приложение Telegram (чат «Telegram» / Login code).\n" +
        "Это НЕ SMS. Открой Telegram на телефоне или Desktop, где залогинен этот номер.\n" +
        "Если чата нет — останови (Ctrl+C), в .env поставь TELEGRAM_FORCE_SMS=1 и запусти снова,\n" +
        "или: bun run login-qr (вход по QR без кода).\n",
    )
  } else {
    console.log("\nКод должен прийти SMS на указанный номер.\n")
  }
  return await promptLine("Код (5 цифр): ")
}

const readSessionFile = async (path: string): Promise<string> => {
  if (!(await pathExists(path))) return ""
  return (await readUtf8(path)).trim()
}

export const createTelegramClient = (sessionString: string, cfg: RuntimeConfig): TelegramClient =>
  new TelegramClient(new StringSession(sessionString), cfg.env.telegramApiId, cfg.env.telegramApiHash, {
    connectionRetries: 10,
    autoReconnect: true,
    useWSS: cfg.env.telegramUseWss,
    ...(cfg.env.telegramProxy ? { proxy: cfg.env.telegramProxy } : {}),
  })

const isAuthorized = async (client: TelegramClient): Promise<boolean> => {
  try {
    await client.invoke(new Api.updates.GetState())
    return true
  } catch {
    return false
  }
}

/** Не путаем сетевой сбой с «нужен новый логин». */
const ensureAuthorized = async (
  client: TelegramClient,
  cfg: RuntimeConfig,
  hadStoredSession: boolean,
): Promise<void> => {
  if (await isAuthorized(client)) return

  if (hadStoredSession) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      logger.warn("telegram.auth.retry", { attempt })
      await sleep(1500 * attempt)
      if (!client.connected) {
        await client.connect()
      }
      if (await isAuthorized(client)) return
    }
    throw new Error(
      "Сессия .telegram_session не принимается Telegram. Удали файл и войди заново: bun run ping",
    )
  }

  logger.info("telegram.auth.login.start")
  console.log("\nПервый вход: телефон → код → при 2FA пароль.\n")

  await client.start({
    phoneNumber: async () => {
      const phone =
        cfg.env.telegramPhone ?? (await promptLine("Телефон (+79123456789): "))
      console.log(`\nЗапрашиваю код для ${phone}…`)
      return phone
    },
    forceSMS: cfg.env.telegramForceSms,
    phoneCode: promptPhoneCode,
    password: async () => await promptLine("Пароль 2FA (Enter если нет): "),
    onError: logAuthError,
  })

  if (!(await isAuthorized(client))) {
    throw new Error("Не удалось авторизоваться в Telegram после ввода кода.")
  }
}

export const connectTelegram = async (cfg: RuntimeConfig): Promise<TelegramClient> => {
  const stored = await readSessionFile(cfg.env.sessionFile)
  const hadStoredSession = stored.length > 0
  const client = createTelegramClient(stored, cfg)

  logger.info("telegram.connecting", {
    useWss: cfg.env.telegramUseWss,
    proxy: cfg.env.telegramProxyLabel ?? null,
    hadStoredSession,
  })

  const connectDeadlineMs = 60_000
  const started = Date.now()
  let connected = false

  if (!hadStoredSession) {
    if (!client.connected) {
      await client.connect()
    }
    await ensureAuthorized(client, cfg, false)
    connected = true
  } else {
    while (Date.now() - started < connectDeadlineMs) {
      if (!client.connected) {
        try {
          await client.connect()
        } catch (e) {
          logger.warn("telegram.connect.attempt_failed", { error: String(e) })
        }
      }
      if (await isAuthorized(client)) {
        connected = true
        break
      }
      logger.warn("telegram.auth.waiting", {
        elapsedSec: Math.floor((Date.now() - started) / 1000),
      })
      await sleep(2000)
    }
  }

  if (!connected) {
    if (hadStoredSession) {
      throw new Error(
        "Telegram: сессия есть, но API не отвечает 60 с. Проверь VPN/SOCKS (TELEGRAM_PROXY_URL) или bun run diagnose",
      )
    }
    await ensureAuthorized(client, cfg, false)
  } else if (hadStoredSession && !(await isAuthorized(client))) {
    await ensureAuthorized(client, cfg, hadStoredSession)
  }

  const me = await client.getMe()
  logger.info("telegram.connected", {
    userId: me.id?.toString(),
    username: me.username ?? null,
    phone: me.phone ?? null,
  })

  const saved = client.session.save() as unknown as string
  await writeUtf8(cfg.env.sessionFile, saved)
  logger.info("telegram.session.saved", { sessionFile: cfg.env.sessionFile })
  return client
}

/** Каналы, к которым есть доступ (подписка + валидный @username). */
export const resolveMonitoredChats = async (
  client: TelegramClient,
  chats: string[],
): Promise<string[]> => {
  const valid: string[] = []
  const failed: string[] = []

  for (const chat of chats) {
    try {
      await client.getEntity(chat)
      valid.push(chat)
      logger.debug("telegram.chat.valid", { chat })
    } catch {
      failed.push(chat)
    }
  }

  if (failed.length > 0) {
    logger.warn("telegram.chats.skipped", {
      failed,
      hint: "подпишись на канал этим аккаунтом или проверь @username",
    })
  }

  if (valid.length === 0) {
    throw new Error(
      `Нет доступных каналов из списка. Проверь подписки: ${chats.join(", ")}`,
    )
  }

  return valid
}

/** Отправка в «Избранное» через InputPeerSelf (надёжнее, чем строка "me"). */
export const sendToSavedMessages = async (
  client: TelegramClient,
  text: string,
  label: string,
  retry: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number },
): Promise<number> => {
  const messageId = await withRetry(
    async () => {
      try {
        await client.invoke(
          new Api.messages.SendMessage({
            peer: new Api.InputPeerSelf(),
            message: text,
            randomId: generateRandomLong(true),
            noWebpage: true,
          }),
        )
      } catch (invokeError) {
        logger.warn("telegram.saved_message.invoke_fallback", {
          label,
          error: String(invokeError),
        })
        const msg = await client.sendMessage("me", { message: text, linkPreview: false })
        return Number(msg.id)
      }
      return 0
    },
    { label, ...retry },
  )

  logger.info("telegram.saved_message.sent", {
    label,
    chars: text.length,
    messageId,
  })
  return messageId
}
