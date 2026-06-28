import { execSync } from "node:child_process"
import type { ProxyInterface } from "telegram/network/connection/TCPMTProxy.js"

export type TelegramProxyConfig = ProxyInterface

export const parseProxyUrl = (raw: string): TelegramProxyConfig | undefined => {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  const withScheme = trimmed.includes("://") ? trimmed : `socks5://${trimmed}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    return undefined
  }

  const proto = u.protocol.replace(":", "")
  if (proto !== "socks4" && proto !== "socks5" && proto !== "socks") {
    return undefined
  }

  const socksType = proto === "socks4" ? 4 : 5
  const port = u.port ? Number.parseInt(u.port, 10) : 1080
  if (!Number.isFinite(port) || port <= 0) return undefined

  const host = u.hostname
  const hostOk =
    host === "localhost" ||
    host.includes(".") ||
    host.includes(":") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  if (!hostOk) return undefined

  const proxy: TelegramProxyConfig = { ip: host, port, socksType: socksType as 4 | 5 }
  if (u.username) proxy.username = decodeURIComponent(u.username)
  if (u.password) proxy.password = decodeURIComponent(u.password)
  return proxy
}

/** ponytail: gsettings only when env empty — Linux desktop fallback */
const readGnomeSocksProxyUrl = (): string | undefined => {
  if (process.platform !== "linux") return undefined
  try {
    const mode = execSync("gsettings get org.gnome.system.proxy mode", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    if (mode !== "'manual'") return undefined
    const host = execSync("gsettings get org.gnome.system.proxy.socks host", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .replace(/^'|'$/g, "")
    const port = execSync("gsettings get org.gnome.system.proxy.socks port", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
    if (!host || !port || port === "0") return undefined
    return `socks5://${host}:${port}`
  } catch {
    return undefined
  }
}

export const resolveProxyUrl = (): string | undefined => {
  const fromEnv =
    process.env.TELEGRAM_PROXY_URL ??
    process.env.ALL_PROXY ??
    process.env.all_proxy ??
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy

  if (fromEnv?.trim()) return fromEnv.trim()
  return readGnomeSocksProxyUrl()
}

export const resolveTelegramProxy = (): TelegramProxyConfig | undefined => {
  const url = resolveProxyUrl()
  if (!url) return undefined
  return parseProxyUrl(url)
}

export const proxyLabel = (proxy: TelegramProxyConfig): string =>
  `socks${proxy.socksType}://${proxy.ip}:${proxy.port}`
