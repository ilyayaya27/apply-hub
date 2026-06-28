import { pathExists, readUtf8, writeUtf8 } from "../utils/io.ts"
import { extractContacts } from "./contacts.ts"

export type DedupSnapshot = {
  /** Message fingerprint */
  messageKey: string
  urlKeys: string[]
}

export const buildDedupSnapshot = (
  chatIdStr: string,
  messageId: number,
  fullText: string,
): DedupSnapshot => {
  const contacts = extractContacts(fullText)
  const urlKeys = contacts
    .filter((c) => c.kind === "job_url")
    .map((c) => `u:${c.value}`)
  return {
    messageKey: `m:${chatIdStr}:${messageId}`,
    urlKeys: [...new Set(urlKeys)],
  }
}

export class DedupStore {
  private entries: Record<string, number> = {}
  private loaded = false

  constructor(
    private readonly path: string,
    private readonly maxEntries: number,
  ) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    if (!(await pathExists(this.path))) {
      this.entries = {}
      return
    }
    try {
      const raw = JSON.parse(await readUtf8(this.path)) as { entries?: Record<string, number> }
      this.entries = raw.entries ?? {}
    } catch {
      this.entries = {}
    }
  }

  private prune(): void {
    const keys = Object.keys(this.entries)
    if (keys.length <= this.maxEntries) return
    const sorted = keys.sort((a, b) => (this.entries[a] ?? 0) - (this.entries[b] ?? 0))
    const drop = sorted.length - this.maxEntries
    for (let i = 0; i < drop; i++) {
      const k = sorted[i]
      if (k) delete this.entries[k]
    }
  }

  /** True if we should skip notify (duplicate URL cross-post) */
  async shouldSkipUrls(snapshot: DedupSnapshot): Promise<boolean> {
    await this.ensureLoaded()
    return snapshot.urlKeys.some((k) => k in this.entries)
  }

  async hasMessage(snapshot: DedupSnapshot): Promise<boolean> {
    await this.ensureLoaded()
    return snapshot.messageKey in this.entries
  }

  async mark(snapshot: DedupSnapshot): Promise<void> {
    await this.ensureLoaded()
    const now = Math.floor(Date.now() / 1000)
    this.entries[snapshot.messageKey] = now
    for (const k of snapshot.urlKeys) {
      this.entries[k] = now
    }
    this.prune()
    await writeUtf8(this.path, JSON.stringify({ entries: this.entries }, null, 0))
  }
}
