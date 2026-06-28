import type { MatchMode, MatcherRules } from "../config/types.ts"

const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .trim()

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Exclude term as whole token (avoids java ⊂ javascript) */
const buildExcludePattern = (term: string): RegExp => {
  const t = term.trim().toLowerCase()
  if (t === "") return /$^/
  const safe = escapeRegex(t)
  return new RegExp(`(?<![\\p{L}\\p{N}_])${safe}(?![\\p{L}\\p{N}_])`, "iu")
}

export type MatchDecision = "strict_match" | "candidate_level_missing" | "reject"

export type MatchResult = {
  decision: MatchDecision
  reasons: string[]
  includeHits: string[]
  levelHits: string[]
  excludeHit?: string
}

export const matchVacancy = (text: string, rules: MatcherRules, mode: MatchMode): MatchResult => {
  const normalized = normalizeText(text)

  for (const ex of rules.excludeAny) {
    const pattern = buildExcludePattern(ex)
    if (pattern.test(normalized)) {
      return {
        decision: "reject",
        reasons: [`excluded:${ex}`],
        includeHits: [],
        levelHits: [],
        excludeHit: ex,
      }
    }
  }

  const includeHits = rules.includeAny.filter((w) => normalized.includes(w.trim().toLowerCase()))
  if (includeHits.length === 0) {
    return {
      decision: "reject",
      reasons: ["missing:includeAny"],
      includeHits: [],
      levelHits: [],
    }
  }

  const levelHits = rules.levelAny.filter((w) => normalized.includes(w.trim().toLowerCase()))
  if (levelHits.length > 0) {
    return {
      decision: "strict_match",
      reasons: [`include:${includeHits.join(",")}`, `level:${levelHits.join(",")}`],
      includeHits,
      levelHits,
    }
  }

  if (mode === "dual") {
    return {
      decision: "candidate_level_missing",
      reasons: [`include:${includeHits.join(",")}`, "missing:levelAny"],
      includeHits,
      levelHits: [],
    }
  }

  return {
    decision: "reject",
    reasons: ["missing:levelAny"],
    includeHits,
    levelHits: [],
  }
}
