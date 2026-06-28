export type ContactKind = "telegram_username" | "telegram_link" | "email" | "job_url"

export type ExtractedContact = {
  kind: ContactKind
  /** Canonical display value */
  value: string
}

const JOB_HOST_FRAGMENTS = [
  "hh.ru",
  "habr.com",
  "team.vk.company",
  "getmatch.ru",
  "hirify.me",
  "hirehi.ru",
  "jobrockets.ru",
  "linkedin.com",
  "djinni.co",
  "djinni.io",
  "startup.jobs",
  "remoteok.com",
  "wellfound.com",
  "angel.co",
]

const normalizeTelegramUsername = (handle: string): string => handle.replace(/^@/, "").toLowerCase()

const uniqByValue = (items: ExtractedContact[]): ExtractedContact[] => {
  const seen = new Set<string>()
  const out: ExtractedContact[] = []
  for (const item of items) {
    const key = `${item.kind}:${item.value}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export const normalizeJobUrl = (raw: string): string => {
  try {
    const u = new URL(raw)
    u.hash = ""
    const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
    utmKeys.forEach((k) => u.searchParams.delete(k))
    const pathname = u.pathname.replace(/\/+$/, "") || "/"
    return `${u.protocol}//${u.host.toLowerCase()}${pathname}${u.search}`
  } catch {
    return raw.trim().toLowerCase().replace(/\/+$/, "")
  }
}

export const extractContacts = (text: string): ExtractedContact[] => {
  const found: ExtractedContact[] = []

  const tgHandleRe = /(^|[^\w@])@([a-z][a-z0-9_]{3,31})\b/giu
  for (const m of text.matchAll(tgHandleRe)) {
    const handle = normalizeTelegramUsername(m[2] ?? "")
    if (!handle) continue
    found.push({
      kind: "telegram_username",
      value: `https://t.me/${handle}`,
    })
  }

  const tgLinkRe = /(?:https?:\/\/)?(?:www\.)?t\.me\/([a-z][a-z0-9_]{3,31})(?:\/[^\s]*)?/giu
  for (const m of text.matchAll(tgLinkRe)) {
    const handle = normalizeTelegramUsername(m[1] ?? "")
    if (!handle) continue
    found.push({
      kind: "telegram_link",
      value: `https://t.me/${handle}`,
    })
  }

  const emailRe = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/giu
  for (const m of text.matchAll(emailRe)) {
    found.push({
      kind: "email",
      value: m[0].toLowerCase(),
    })
  }

  const urlRe = /\bhttps?:\/\/[^\s<>()]+[^\s<>().,:;!?]/giu
  for (const m of text.matchAll(urlRe)) {
    const rawUrl = m[0]
    const lower = rawUrl.toLowerCase()
    const isJobBoard = JOB_HOST_FRAGMENTS.some((frag) => lower.includes(frag))
    if (!isJobBoard) continue
    found.push({
      kind: "job_url",
      value: normalizeJobUrl(rawUrl),
    })
  }

  const bareJobRe =
    /\b(?:[\w-]+\.)?(?:hh\.ru|habr\.com|team\.vk\.company|getmatch\.ru|hirify\.me|hirehi\.ru|jobrockets\.ru|linkedin\.com|djinni\.co|djinni\.io|startup\.jobs|remoteok\.com|wellfound\.com|angel\.co)\/[^\s<>().,:;!?]+/giu
  for (const m of text.matchAll(bareJobRe)) {
    const raw = m[0]
    const withScheme = raw.startsWith("http") ? raw : `https://${raw}`
    const lower = withScheme.toLowerCase()
    const isJobBoard = JOB_HOST_FRAGMENTS.some((frag) => lower.includes(frag))
    if (!isJobBoard) continue
    found.push({
      kind: "job_url",
      value: normalizeJobUrl(withScheme),
    })
  }

  return uniqByValue(found)
}

export const formatContactsBlock = (contacts: ExtractedContact[]): string => {
  if (contacts.length === 0) return "(контакты не распознаны — открой пост и найди @username или ссылку)"
  const lines = contacts.map((c) => {
    switch (c.kind) {
      case "telegram_username":
      case "telegram_link":
        return `TG: ${c.value}`
      case "email":
        return `Email: ${c.value}`
      case "job_url":
        return `Вакансия: ${c.value}`
      default:
        return c.value
    }
  })
  return lines.join("\n")
}
