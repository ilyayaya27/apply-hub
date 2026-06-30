import { describe, expect, it } from "vitest";
import { scoreVacancy, passesFit } from "../lib/fit.js";

const frontendVacancy = {
  title: "Senior Frontend Developer",
  rawText: "React TypeScript Next.js remote",
  skills: ["react", "typescript"],
  tags: ["frontend", "remote"],
  remote: true,
  tier: "yellow",
  seniority: "senior",
  languages: { ru: true, en: true },
};

describe("scoreVacancy", () => {
  it("scores frontend remote highly", () => {
    expect(scoreVacancy(frontendVacancy)).toBeGreaterThanOrEqual(45);
  });

  it("penalizes seo roles", () => {
    const seo = {
      ...frontendVacancy,
      title: "SEO Specialist",
      rawText: "SEO marketing",
      skills: ["seo"],
    };
    expect(scoreVacancy(seo)).toBeLessThan(scoreVacancy(frontendVacancy));
  });

  it("passesFit respects threshold", () => {
    expect(passesFit(frontendVacancy, 45)).toBe(true);
    expect(
      passesFit(
        {
          title: "1C Accountant",
          rawText: "1c бухгалтер учёт",
          skills: ["1c"],
          tags: [],
          remote: false,
          tier: "red",
          seniority: null,
          languages: {},
        },
        45,
      ),
    ).toBe(false);
  });
});
