import { describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseChannelHtml } from "../lib/ingest.js";
import { scoreVacancy } from "../lib/fit.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "..", "fixtures", "revacancy-channel.html");

describe("ingest boundary", () => {
  it("parses fixture posts with routes and fit scores", async () => {
    const { readFileSync } = await import("node:fs");
    const html = readFileSync(fixturePath, "utf8");
    const posts = parseChannelHtml(html, "revacancy");

    expect(posts.length).toBe(4);

    const frontend = posts.find((p) => p.postId === "150001");
    expect(frontend).toBeDefined();
    expect(frontend.route).toBe("rvc_bot");
    expect(frontend.title).toMatch(/Frontend/i);
    expect(scoreVacancy(frontend)).toBeGreaterThanOrEqual(45);

    const hh = posts.find((p) => p.postId === "150002");
    expect(hh?.route).toBe("hh");

    const seo = posts.find((p) => p.postId === "150003");
    expect(seo?.route).toBe("form");
    expect(scoreVacancy(seo)).toBeLessThan(45);

    const formSmoke = posts.find((p) => p.postId === "150004");
    expect(formSmoke?.route).toBe("form");
    expect(formSmoke?.primaryUrl).toContain("forms.gle/rvc-smoke-simple-form");
    expect(scoreVacancy(formSmoke)).toBeGreaterThanOrEqual(45);
  });
});
