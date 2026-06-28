import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildVacancyPost } from './ingest-post.js';
import { buildPostLink, previewToGramJsChat } from './tg-contacts.js';

const messageEpochSec = (message) => {
  const d = message?.date;
  if (d instanceof Date) return Math.floor(d.getTime() / 1000);
  if (typeof d === 'number') {
    if (d > 2_000_000_000_000) return Math.floor(d / 1000);
    return d;
  }
  if (typeof d === 'string') {
    const parsed = Date.parse(d);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return undefined;
};

/** @param {import('telegram').Api.Message} message */
export const extractGramJsHrefLinks = (message) => {
  const links = [];
  const text = typeof message.message === 'string' ? message.message : '';

  message.entities?.forEach((entity) => {
    const name = entity?.className ?? entity?.constructor?.name ?? '';
    if (name === 'MessageEntityUrl') {
      links.push(text.slice(entity.offset, entity.offset + entity.length));
    }
    if (name === 'MessageEntityTextUrl' && entity.url) {
      links.push(entity.url);
    }
  });

  message.replyMarkup?.rows?.forEach((row) => {
    row.buttons?.forEach((button) => {
      if (button.url) links.push(button.url);
    });
  });

  return links;
};

/**
 * @param {string} channel preview slug
 * @param {import('telegram').Api.Message} message
 */
export const mapGramJsMessageToPost = (channel, message) => {
  const messageId = Number(message.id);
  if (!Number.isFinite(messageId)) return null;

  const rawText = typeof message.message === 'string' ? message.message.replace(/\s+/g, ' ').trim() : '';
  if (!rawText || rawText.length < 40) return null;

  return buildVacancyPost({
    channel,
    postId: String(messageId),
    rawText,
    hrefLinks: extractGramJsHrefLinks(message),
  });
};

/** @param {import('telegram').TelegramClient} client @param {string} channel @param {{ limit?: number, minAgeHours?: number }} opts */
export const ingestChannelGramJs = async (client, channel, opts = {}) => {
  const limit = opts.limit ?? 50;
  const minAgeHours = opts.minAgeHours ?? 168;
  const cutoffEpoch = Math.floor(Date.now() / 1000) - minAgeHours * 3600;
  const chat = previewToGramJsChat(channel);

  const messages = await client.getMessages(chat, { limit });
  const posts = [];

  messages.forEach((message) => {
    if (!message) return;
    const epochSec = messageEpochSec(message);
    if (epochSec && epochSec < cutoffEpoch) return;

    const post = mapGramJsMessageToPost(channel, message);
    if (post) posts.push(post);
  });

  return posts;
};

let clientPromise = null;

/** @param {{ telegramApiId: number, telegramApiHash: string, telegramSessionFile: string, telegramUseWss?: boolean }} cfg */
export const connectGramJsClient = async (cfg) => {
  if (!cfg.telegramApiId || !cfg.telegramApiHash) {
    throw new Error(
      'GramJS: задай TELEGRAM_API_ID и TELEGRAM_API_HASH в credentials.env (см. apply-hub/platforms/telegram/.env.example)',
    );
  }

  const { TelegramClient } = await import('telegram');
  const { StringSession } = await import('telegram/sessions/index.js');
  const { Api } = await import('telegram');

  const sessionPath = cfg.telegramSessionFile;
  const stored = existsSync(sessionPath) ? readFileSync(sessionPath, 'utf8').trim() : '';
  if (!stored) {
    throw new Error(
      `GramJS: нет сессии в ${sessionPath}. Войди через apply-hub (./telegram-ping.sh) или скопируй .telegram_session`,
    );
  }

  const client = new TelegramClient(
    new StringSession(stored),
    cfg.telegramApiId,
    cfg.telegramApiHash,
    {
      connectionRetries: 10,
      autoReconnect: true,
      useWSS: cfg.telegramUseWss ?? false,
    },
  );

  await client.connect();

  try {
    await client.invoke(new Api.updates.GetState());
  } catch (err) {
    await client.disconnect();
    throw new Error(`GramJS: сессия не принимается Telegram — удали ${sessionPath} и войди заново (${err})`);
  }

  const saved = client.session.save();
  writeFileSync(sessionPath, saved, 'utf8');
  return client;
};

/** @param {import('./config.js').config} cfg */
export const getGramJsClient = async (cfg) => {
  if (!clientPromise) {
    clientPromise = connectGramJsClient(cfg).catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
};

export const resetGramJsClient = () => {
  clientPromise = null;
};
