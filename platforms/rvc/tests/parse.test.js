import { describe, expect, it } from "vitest";
import { parseVacancyText } from "../lib/parse.js";

describe("parseVacancyText", () => {
  it("parses tier, title, skills and remote", () => {
    const text = `🟨 Senior Frontend Developer | 5+ years
▫️ FinTech Corp | Remote
▫️ 3000 - 4500 USD
📡 Удаленка
Требуемые языки: 🇷🇺 🇬🇧
Skills: React, TypeScript, Next.js
Tags: #yellow #frontend`;

    const v = parseVacancyText(text);
    expect(v.tier).toBe("yellow");
    expect(v.title).toMatch(/Senior Frontend/i);
    expect(v.remote).toBe(true);
    expect(v.skills).toEqual(
      expect.arrayContaining(["react", "typescript", "next.js"]),
    );
    expect(v.languages.ru).toBe(true);
    expect(v.languages.en).toBe(true);
    expect(v.seniority).toBe("senior");
  });
});
