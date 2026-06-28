import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { channelPreviewUrl, config } from "./config.js";
import { buildVacancyPost } from "./ingest-post.js";

const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * @param {string} html
 * @param {string} channel
 */
export const parseChannelHtml = (html, channel) => {
  const $ = cheerio.load(html);
  const posts = [];

  $(".tgme_widget_message_wrap").each((_, wrap) => {
    const node = $(wrap).find(".tgme_widget_message").first();
    const dataPost = node.attr("data-post") ?? "";
    const [, postId] = dataPost.split("/");
    if (!postId) return;

    const textEl = node.find(".tgme_widget_message_text").first();
    const rawHtml = textEl.html() ?? "";
    const rawText = textEl.text().replace(/\s+/g, " ").trim();
    if (!rawText || rawText.length < 40) return;

    const hrefLinks = [];
    textEl.find("a[href]").each((__, a) => {
      const href = $(a).attr("href");
      if (href) hrefLinks.push(href);
    });
    node.find(".tgme_widget_message_inline_keyboard a[href]").each((__, a) => {
      const href = $(a).attr("href");
      if (href) hrefLinks.push(href);
    });

    posts.push(
      buildVacancyPost({
        channel,
        postId,
        rawHtml,
        rawText,
        hrefLinks,
      }),
    );
  });

  return posts;
};

export const fetchChannelHtml = async (channel) => {
  const url = channelPreviewUrl(channel);
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.text();
};

export const loadFixtureHtml = (fixturePath) =>
  readFileSync(fixturePath, "utf8");

/**
 * @param {{ channel: string, fixturePath?: string, tgIngestMode?: 'preview' | 'gramjs', gramJsClient?: import('telegram').TelegramClient }} opts
 */
export const ingestChannel = async ({ channel, fixturePath, tgIngestMode, gramJsClient }) => {
  const mode = tgIngestMode ?? config.tgIngestMode ?? "preview";

  if (mode === "gramjs") {
    if (fixturePath) {
      throw new Error("GramJS ingest не поддерживает fixturePath — используй preview или live API");
    }
    try {
      const { getGramJsClient, ingestChannelGramJs } = await import("./ingest-gramjs.js");
      const client = gramJsClient ?? (await getGramJsClient(config));
      return ingestChannelGramJs(client, channel, {
        limit: config.tgGramJsLimit,
        minAgeHours: config.tgGramJsMaxAgeHours,
      });
    } catch (err) {
      if (!config.tgIngestFallbackPreview) throw err;
      console.warn(
        `[ingest] GramJS failed for @${channel}: ${err.message ?? err}; fallback to preview`,
      );
    }
  }

  const html = fixturePath ? loadFixtureHtml(fixturePath) : await fetchChannelHtml(channel);
  return parseChannelHtml(html, channel);
};
