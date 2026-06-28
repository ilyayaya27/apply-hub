/**
 * Диагностика: пишет отчёт в logs/diagnose.log (и в консоль).
 * Запуск: bun run diagnose
 */
import "dotenv/config"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { connect } from "node:net"
import { initRuntimeConfig } from "./config/loadConfig.ts"
import { connectTelegram, sendToSavedMessages } from "./services/telegram.ts"

const logPath = join(process.cwd(), "logs", "diagnose.log")
const lines: string[] = []

const log = (msg: string): void => {
  const line = `${new Date().toISOString()} ${msg}`
  lines.push(line)
  console.log(line)
}

const tcpProbe = (host: string, port: number, ms = 5000): Promise<boolean> =>
  new Promise((resolve) => {
    const s = connect({ host, port, timeout: ms }, () => {
      s.destroy()
      resolve(true)
    })
    s.on("error", () => {
      s.destroy()
      resolve(false)
    })
    setTimeout(() => {
      s.destroy()
      resolve(false)
    }, ms)
  })

await mkdir(join(process.cwd(), "logs"), { recursive: true })
log("=== JobHarvest diagnose ===")
log(`cwd: ${process.cwd()}`)
log(`TELEGRAM_USE_WSS: ${process.env.TELEGRAM_USE_WSS ?? "(default true)"}`)
log(`TELEGRAM_PROXY_URL: ${process.env.TELEGRAM_PROXY_URL ?? "(from ALL_PROXY or GNOME socks)"}`)
log(`SESSION_FILE exists: ${await import("./utils/io.ts").then((m) => m.pathExists(process.env.SESSION_FILE ?? ".telegram_session"))}`)

log("TCP probe 149.154.167.41:443 ...")
log(`  result: ${await tcpProbe("149.154.167.41", 443) ? "OK" : "FAIL"}`)
log("TCP probe 149.154.167.41:80 ...")
log(`  result: ${await tcpProbe("149.154.167.41", 80) ? "OK" : "FAIL"}`)

try {
  await initRuntimeConfig()
  const cfg = (await import("./config/loadConfig.ts")).getRuntimeConfig()
  if (cfg.env.telegramProxy) {
    log(`Resolved proxy: ${cfg.env.telegramProxyLabel}`)
    log(`TCP probe proxy ${cfg.env.telegramProxy.ip}:${cfg.env.telegramProxy.port} ...`)
    log(
      `  result: ${await tcpProbe(cfg.env.telegramProxy.ip, cfg.env.telegramProxy.port) ? "OK" : "FAIL"}`,
    )
  } else {
    log("Resolved proxy: (none)")
  }
  log("Connecting Telegram (GramJS)...")
  const client = await connectTelegram(cfg)
  const me = await client.getMe()
  log(`Authorized: user_id=${me.id} phone=${me.phone ?? "-"} username=${me.username ?? "-"}`)

  const testText = `JobHarvest diagnose ${new Date().toLocaleString("ru-RU")}`
  const mid = await sendToSavedMessages(client, testText, "diagnose", {
    maxAttempts: cfg.env.retryMaxAttempts,
    baseDelayMs: cfg.env.retryBaseMs,
    maxDelayMs: cfg.env.retryMaxMs,
  })
  log(`Send to Saved Messages: OK messageId=${mid}`)
  await new Promise((r) => setTimeout(r, 2000))
  await client.disconnect()
  log("Disconnect: OK")
} catch (e) {
  log(`FAIL: ${e instanceof Error ? e.message : String(e)}`)
  if (e instanceof Error && e.stack) log(e.stack.split("\n").slice(0, 5).join("\n"))
}

await writeFile(logPath, `${lines.join("\n")}\n`)
log(`Report saved: ${logPath}`)
