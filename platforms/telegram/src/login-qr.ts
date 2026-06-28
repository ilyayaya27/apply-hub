/** Вход по QR — когда код в приложение/SMS не приходит. Скан: Настройки → Устройства. */
import * as readline from "node:readline/promises"
import qrcode from "qrcode-terminal"
import "dotenv/config"
import { initRuntimeConfig, getRuntimeConfig } from "./config/loadConfig.ts"
import { createTelegramClient } from "./services/telegram.ts"
import { logger } from "./services/logger.ts"
import { writeUtf8 } from "./utils/io.ts"

const printLoginQr = (loginUrl: string): void => {
  qrcode.generate(loginUrl, { small: true }, (ascii) => {
    console.log(ascii)
  })
}

const promptLine = async (question: string): Promise<string> => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

await initRuntimeConfig()
const cfg = getRuntimeConfig()

const client = createTelegramClient("", cfg)
logger.info("telegram.qr.connecting", {
  proxy: cfg.env.telegramProxyLabel ?? null,
})

await client.connect()

const apiCredentials = {
  apiId: cfg.env.telegramApiId,
  apiHash: cfg.env.telegramApiHash,
}

console.log(
  "\nВход по QR (без SMS и без кода в чате «Telegram»):\n" +
    "  Телефон → Настройки → Устройства → Подключить устройство → сканируй QR\n" +
    "  Или открой ссылку tg:// ниже на том же телефоне.\n",
)

await client.signInUserWithQrCode(apiCredentials, {
  qrCode: async (code) => {
    const loginUrl = `tg://login?token=${code.token.toString("base64url")}`
    console.log("\n--- QR (действует ~30 с, обновится автоматически) ---")
    printLoginQr(loginUrl)
    console.log(`Ссылка (если QR не читается): ${loginUrl}\n`)
  },
  password: async (hint) => {
    const suffix = hint ? ` (подсказка: ${hint})` : ""
    return await promptLine(`Пароль 2FA${suffix}: `)
  },
  onError: (err) => {
    console.error(`Ошибка: ${err instanceof Error ? err.message : String(err)}`)
    return false
  },
})

const me = await client.getMe()
const saved = client.session.save() as unknown as string
await writeUtf8(cfg.env.sessionFile, saved)

console.log(
  `\nOK: залогинен как ${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() +
    (me.username ? ` @${me.username}` : "") +
    `\nСессия: ${cfg.env.sessionFile}\n`,
)

await client.disconnect()
