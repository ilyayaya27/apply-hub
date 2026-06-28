const hotWords = [
  { pattern: /react/i, score: 22 },
  { pattern: /typescript|ts\b/i, score: 22 },
  { pattern: /next(\.js)?|nuxt/i, score: 16 },
  { pattern: /frontend|front-end|фронтенд|фронт/i, score: 18 },
  { pattern: /full[\s-]?stack|fullstack/i, score: 14 },
  { pattern: /javascript|\bjs\b/i, score: 10 },
  { pattern: /vue|angular/i, score: 8 },
  { pattern: /redux|rtk|zustand/i, score: 8 },
  { pattern: /jest|rtl|testing library/i, score: 6 },
  { pattern: /figma|tailwind|css|html/i, score: 6 },
];

const penalties = [
  { pattern: /1с|1c\b|seo|копирайт|маркетолог|бухгалтер|devops only|golang only|java only/i, score: -40 },
  { pattern: /designer only|дизайнер/i, score: -25 },
  { pattern: /junior|intern|стажёр|стажер/i, score: -15 },
];

/**
 * @param {import('./types.js').ParsedVacancy & { tags?: string[] }} vacancy
 */
export const scoreVacancy = (vacancy) => {
  const text = `${vacancy.title} ${vacancy.rawText} ${(vacancy.skills ?? []).join(" ")}`;
  let score = 0;

  hotWords.forEach(({ pattern, score: bonus }) => {
    if (pattern.test(text)) score += bonus;
  });

  penalties.forEach(({ pattern, score: penalty }) => {
    if (pattern.test(text)) score += penalty;
  });

  if (vacancy.remote) score += 12;
  if (vacancy.tier === "yellow" || vacancy.tier === "green") score += 8;
  if (vacancy.seniority === "senior") score += 10;
  if (vacancy.seniority === "middle") score += 5;
  if (vacancy.languages?.ru) score += 5;

  const tagBonus = (vacancy.tags ?? []).some((t) =>
    /frontend|react|typescript|remote/i.test(t),
  );
  if (tagBonus) score += 8;

  return Math.max(0, Math.min(100, score));
};

export const passesFit = (vacancy, minScore) =>
  scoreVacancy(vacancy) >= minScore;

/**
 * @param {import('./types.js').ParsedVacancy} vacancy
 * @param {RegExp[]} excludePatterns
 */
export const isExcludedByProfile = (vacancy, excludePatterns = []) => {
  const text = `${vacancy.title ?? ""} ${vacancy.rawText ?? ""} ${vacancy.company ?? ""}`;
  return excludePatterns.some((re) => re.test(text));
};

/**
 * @param {import('./types.js').ParsedVacancy} vacancy
 * @param {{ min_fit_score?: number, exclude_patterns?: RegExp[] }} profile
 */
export const evaluateVacancy = (vacancy, profile = {}) => {
  const minScore = profile.min_fit_score ?? 55;
  const excludes = profile.exclude_patterns ?? [];
  if (isExcludedByProfile(vacancy, excludes)) {
    return { fitScore: scoreVacancy(vacancy), pass: false, reason: "excluded" };
  }
  const fitScore = scoreVacancy(vacancy);
  return {
    fitScore,
    pass: fitScore >= minScore,
    reason: fitScore >= minScore ? "ok" : "low_score",
  };
};
