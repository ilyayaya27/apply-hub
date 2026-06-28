import { describe, expect, it } from "bun:test"
import { parseProxyUrl, proxyLabel } from "../src/config/parseProxy.ts"

describe("parseProxyUrl", () => {
  it("parses socks5 with host and port", () => {
    const p = parseProxyUrl("socks5://127.0.0.1:10808")
    expect(p).toEqual({ ip: "127.0.0.1", port: 10808, socksType: 5 })
    expect(proxyLabel(p!)).toBe("socks5://127.0.0.1:10808")
  })

  it("parses host:port without scheme as socks5", () => {
    expect(parseProxyUrl("127.0.0.1:1080")).toEqual({
      ip: "127.0.0.1",
      port: 1080,
      socksType: 5,
    })
  })

  it("parses socks4 and auth", () => {
    expect(parseProxyUrl("socks4://proxy.example:1080")).toEqual({
      ip: "proxy.example",
      port: 1080,
      socksType: 4,
    })
    expect(parseProxyUrl("socks5://user:secret@127.0.0.1:10808")).toEqual({
      ip: "127.0.0.1",
      port: 10808,
      socksType: 5,
      username: "user",
      password: "secret",
    })
  })

  it("returns undefined for http or empty", () => {
    expect(parseProxyUrl("")).toBeUndefined()
    expect(parseProxyUrl("http://127.0.0.1:8080")).toBeUndefined()
    expect(parseProxyUrl("not-a-url")).toBeUndefined()
  })
})
