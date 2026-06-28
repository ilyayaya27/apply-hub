const TIER_EMOJI = {
  "🟥": "red",
  "🟨": "yellow",
  "🟩": "green",
  "🟪": "purple",
  "⬜️": "white",
  "⬜": "white",
};

const stripHtml = (html) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

/**
 * @param {string} rawText — plain text or HTML body of a TG post
 */
export const parseVacancyText = (rawText) => {
  const text = rawText.includes("<") ? stripHtml(rawText) : rawText.trim();
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const firstLine = lines[0] ?? "";
  const tierEmoji = [...firstLine].find((ch) => TIER_EMOJI[ch]) ?? null;
  const tier = tierEmoji ? TIER_EMOJI[tierEmoji] : null;

  const titleMatch = firstLine.match(
    /(?:🟥|🟨|🟩|🟪|⬜️?)?\s*(.+?)(?:\s*\|\s*|\s+)(?:\d+\s*year|\d+\s*лет|year\(s\))/i,
  );
  const title =
    titleMatch?.[1]?.trim() ??
    firstLine.replace(/^[^\wА-Яа-я]+/, "").trim();

  const companyLine = lines.find((l) => l.startsWith("▫️") || l.startsWith("▪"));
  const company = companyLine
    ? (companyLine.replace(/^[▫️▪]\s*/, "").split("|")[0]?.trim() ?? null)
    : null;

  const salaryLine = lines.find((l) =>
    /(\d[\d\s.,]*\s*[-–—]\s*\d[\d\s.,]*|\d[\d\s.,]+)\s*(USD|RUB|₽|\$|EUR|SGD|KZT)/i.test(
      l,
    ),
  );
  const salary = salaryLine?.replace(/^[▫️▪]\s*/, "") ?? null;

  const remote =
    /удаленка|удалёнка|remote|📡/i.test(text) && !/офис|office/i.test(text);
  const relocation = /релокац|relocation/i.test(text);
  const office = /офис|office/i.test(text) && !remote;

  const langLine = lines.find((l) => /требуемые языки|languages/i.test(l));
  const languages = {
    ru: /🇷🇺|russian|рус/i.test(langLine ?? text),
    en: /🇬🇧|🇺🇸|english|англ/i.test(langLine ?? text),
  };

  const skillsLine = lines.find((l) => /^skills:/i.test(l));
  const skills = skillsLine
    ? skillsLine
        .replace(/^skills:\s*/i, "")
        .split(/[,;|]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const tagsLine = lines.find(
    (l) => /^tags:/i.test(l) || /#yellow|#red|#green/i.test(l),
  );
  const tags = tagsLine
    ? [...tagsLine.matchAll(/#([\w/-]+)/gi)].map((m) => m[1].toLowerCase())
    : [];

  const seniority = /senior|lead|principal|staff/i.test(text)
    ? "senior"
    : /middle|mid/i.test(text)
      ? "middle"
      : /junior|intern/i.test(text)
        ? "junior"
        : null;

  return {
    title,
    tier,
    company,
    salary,
    remote,
    relocation,
    office,
    languages,
    skills,
    tags,
    seniority,
    rawText: text,
  };
};
