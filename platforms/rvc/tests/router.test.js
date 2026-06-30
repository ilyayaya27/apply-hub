import { describe, expect, it } from "vitest";
import { classifyApplyRoute } from "../lib/router.js";

describe("classifyApplyRoute", () => {
  it("detects rvc bot", () => {
    const r = classifyApplyRoute({
      text: "Контакты",
      links: ["https://t.me/revacancy_bot?start=v_abc"],
    });
    expect(r.route).toBe("rvc_bot");
  });

  it("detects hh and skips auto", () => {
    const r = classifyApplyRoute({
      text: "",
      links: ["https://hh.ru/vacancy/123"],
    });
    expect(r.route).toBe("hh");
  });

  it("detects google form", () => {
    const r = classifyApplyRoute({
      text: "",
      links: ["https://forms.gle/abc"],
    });
    expect(r.route).toBe("form");
  });
});
