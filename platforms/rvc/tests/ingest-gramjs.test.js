import { describe, expect, it } from 'vitest';
import { parseChannelHtml } from '../lib/ingest.js';
import {
  extractGramJsHrefLinks,
  mapGramJsMessageToPost,
} from '../lib/ingest-gramjs.js';

describe('ingest gramjs mapping', () => {
  it('maps GramJS message with inline button to rvc_bot route', () => {
    const message = {
      id: 42,
      message:
        '🟨 Senior Frontend Developer | 5+ years Remote React TypeScript Next.js Redux #frontend #remote',
      date: Math.floor(Date.now() / 1000),
      replyMarkup: {
        rows: [
          {
            buttons: [{ url: 'https://t.me/revacancy_bot?start=v_inline99' }],
          },
        ],
      },
    };

    const post = mapGramJsMessageToPost('revacancy', message);
    expect(post).not.toBeNull();
    expect(post?.postId).toBe('42');
    expect(post?.route).toBe('rvc_bot');
    expect(post?.links).toContain('https://t.me/revacancy_bot?start=v_inline99');
  });

  it('extractGramJsHrefLinks reads entities and buttons', () => {
    const message = {
      message: 'See https://hh.ru/vacancy/99 and apply',
      entities: [
        {
          className: 'MessageEntityUrl',
          offset: 4,
          length: 24,
        },
      ],
      replyMarkup: {
        rows: [{ buttons: [{ url: 'https://forms.gle/abc' }] }],
      },
    };

    const links = extractGramJsHrefLinks(message);
    expect(links).toContain('https://hh.ru/vacancy/99');
    expect(links).toContain('https://forms.gle/abc');
  });

  it('parseChannelHtml picks up inline keyboard links outside message text', () => {
    const html = `
      <div class="tgme_widget_message_wrap">
        <div class="tgme_widget_message" data-post="revacancy/150004">
          <div class="tgme_widget_message_text">
            🟨 Frontend Developer remote Skills: React TypeScript Next.js
          </div>
          <div class="tgme_widget_message_inline_keyboard">
            <a class="tgme_widget_message_link" href="https://t.me/revacancy_bot?start=v_inline99">Apply</a>
          </div>
        </div>
      </div>`;

    const posts = parseChannelHtml(html, 'revacancy');
    expect(posts.length).toBe(1);
    expect(posts[0].route).toBe('rvc_bot');
    expect(posts[0].links).toContain('https://t.me/revacancy_bot?start=v_inline99');
  });
});
