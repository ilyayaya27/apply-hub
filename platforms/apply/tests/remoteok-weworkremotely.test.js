import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetDbForTests } from '../lib/db.js';
import { runRemoteOk } from '../workers/remoteok.js';
import { runWeWorkRemotely } from '../workers/weworkremotely.js';
import { runRwb } from '../workers/rwb.js';
import { runYandex } from '../workers/yandex.js';
import { runOzon } from '../workers/ozon.js';
import { runAvito } from '../workers/avito.js';
import { runSber } from '../workers/sber.js';
import { runTbank } from '../workers/tbank.js';
import { runBeeline } from '../workers/beeline.js';
import { runCloudru } from '../workers/cloudru.js';

const REMOTEOK_FIXTURE = [
  { legal: 'API Terms of Service: ...' }, // first element is always a non-listing notice
  {
    id: '111',
    position: 'Senior Frontend Engineer (React)',
    company: 'Acme Startup',
    tags: ['react', 'typescript', 'remote'],
    description: 'Build our React + TypeScript UI. Apply at https://acme.example/careers/apply',
    url: 'https://remoteok.com/remote-jobs/111',
    apply_url: 'https://remoteok.com/remote-jobs/111',
  },
  {
    id: '222',
    position: 'Enterprise Sales Manager',
    company: 'Widgets Inc',
    tags: ['sales'],
    description: 'Close deals with enterprise customers.',
    url: 'https://remoteok.com/remote-jobs/222',
    apply_url: 'https://remoteok.com/remote-jobs/222',
  },
];

const WWR_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item>
  <title>Acme: Senior Frontend Developer</title>
  <link>https://weworkremotely.com/remote-jobs/acme-senior-frontend-developer</link>
  <guid>https://weworkremotely.com/remote-jobs/acme-senior-frontend-developer</guid>
  <description>&lt;p&gt;We need React + TypeScript skills.&lt;/p&gt;&lt;p&gt;To apply: &lt;a href="https://acme.example/apply"&gt;https://acme.example/apply&lt;/a&gt;&lt;/p&gt;</description>
</item>
</channel></rss>`;

const RWB_FIXTURE = {
  status: 200,
  data: {
    items: [
      { id: 111, name: 'Frontend-разработчик (Платформа)', direction_role_title: 'Frontend Developer', direction_title: 'IT', city_title: 'Москва', experience_type_title: 'От 3 лет' },
      { id: 222, name: 'Такелажник', direction_role_title: 'Производитель работ', direction_title: 'Строительство', city_title: 'Москва', experience_type_title: 'От 1 года' },
    ],
  },
};

const YANDEX_FIXTURE = {
  results: [
    { id: 1, title: 'Фронтенд-разработчик', short_summary: '', redirect_url: null, publication_slug_url: 'frontend-1', vacancy: { cities: [{ name: 'Москва' }] } },
    { id: 2, title: 'Разработчик интерфейсов', short_summary: '', redirect_url: null, publication_slug_url: 'frontend-2', vacancy: { cities: [{ name: 'Москва' }] } },
  ],
};

const OZON_FIXTURE = {
  items: [
    { hhId: 111, title: 'Frontend-разработчик', department: 'Ozon Tech', city: 'Москва', workFormat: ['Гибрид'], experience: '3-6 лет' },
    { hhId: 222, title: 'Backend-разработчик', department: 'Ozon Tech', city: 'Москва', workFormat: ['Гибрид'], experience: '3-6 лет' },
  ],
  meta: { page: 1, totalPages: 1 },
};

const AVITO_FIXTURE = `<!doctype html><html><body>
<div class="vacancies-section__item" data-vacancy-id="1" data-vacancy-geo="Москва" data-vacancy-remote="Да">
  <a class="vacancies-section__item-name" href="/vacancies/1/">Frontend-разработчик</a>
</div>
<div class="vacancies-section__item" data-vacancy-id="2" data-vacancy-geo="Москва" data-vacancy-remote="Нет">
  <a class="vacancies-section__item-name" href="/vacancies/2/">Backend-разработчик</a>
</div>
</body></html>`;

const SBER_FIXTURE = {
  data: {
    vacancies: [
      { internalId: 1, title: 'Frontend-разработчик (React)', specialization: '', city: 'Москва', region: '', introduction: '' },
      { internalId: 2, title: 'Backend-разработчик', specialization: '', city: 'Москва', region: '', introduction: '' },
    ],
    total: 2,
  },
};

const TBANK_FIXTURE = `<!doctype html><html><body><script id="__TRAMVAI_STATE__" type="application/json">
{"vacanciesStore":{"vacancies":[{"title":"Frontend-разработчик","category":"it","shortDescription":"","salary":"","cities":[],"tags":[],"urlSlug":"frontend-1","seoSlug":"frontend"},{"title":"Backend-разработчик","category":"it","shortDescription":"","salary":"","cities":[],"tags":[],"urlSlug":"backend-1","seoSlug":"backend"}],"nextPagination":{"it":{"isFinished":true}}}}
</script></body></html>`;

const BEELINE_FIXTURE = {
  results: [
    { id: 1, name: 'Frontend разработчик', role: 'Разработчик Frontend', city: ['Москва'], work_format: ['Гибрид'], grade: 'Middle' },
    { id: 2, name: 'Backend разработчик', role: 'Разработчик Backend', city: ['Москва'], work_format: ['Гибрид'], grade: 'Middle' },
  ],
};

const CLOUDRU_FIXTURE = {
  data: [
    { id: 1, position: 'Frontend разработчик', isClosed: false, unit: { name: 'IT' }, work_format: { name: 'Гибрид' }, experience: { name: '3-5 лет' } },
    { id: 2, position: 'Backend разработчик', isClosed: false, unit: { name: 'IT' }, work_format: { name: 'Гибрид' }, experience: { name: '3-5 лет' } },
    { id: 3, position: 'Frontend разработчик (закрыта)', isClosed: true, unit: { name: 'IT' }, work_format: { name: 'Гибрид' }, experience: { name: '3-5 лет' } },
  ],
};

describe('remoteok + weworkremotely harvest workers', () => {
  let tmpDir;
  let fetchSpy;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'apply-hub-harvest-'));
    process.env.JOB_HUB_DB = join(tmpDir, 'test.db');
    process.env.JOB_HUB_SKIP_STATE_MIGRATE = '1';
    resetDbForTests();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    resetDbForTests();
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.JOB_HUB_DB;
    delete process.env.JOB_HUB_SKIP_STATE_MIGRATE;
  });

  it('remoteok: pre-filters non-frontend listings and enqueues via harvest pipeline', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => REMOTEOK_FIXTURE });

    const out = await runRemoteOk({ limit: 10 });

    expect(out.ok).toBe(true);
    expect(out.scanned).toBe(2);
    expect(out.candidates).toBe(1); // sales job filtered out
    expect(out.results).toHaveLength(1);
    expect(out.results[0].company).toBe('Acme Startup');
    expect(out.results[0].action).toBeDefined();
  });

  it('remoteok: surfaces fetch errors instead of throwing', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 503 });
    const out = await runRemoteOk({ limit: 10 });
    expect(out.ok).toBe(false);
  });

  it('weworkremotely: parses RSS items and enqueues via harvest pipeline', async () => {
    fetchSpy.mockResolvedValue({ ok: true, text: async () => WWR_FIXTURE });

    const out = await runWeWorkRemotely({ limit: 10 });

    expect(out.ok).toBe(true);
    expect(out.scanned).toBe(1);
    expect(out.results).toHaveLength(1);
    expect(out.results[0].title).toBe('Acme: Senior Frontend Developer');
    expect(out.results[0].action).toBeDefined();
  });

  it('rwb: filters by direction_role_title, ignores non-dev roles', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => RWB_FIXTURE });

    const out = await runRwb({ limit: 10 });

    expect(out.ok).toBe(true);
    expect(out.scanned).toBe(2);
    expect(out.candidates).toBe(1); // такелажник отфильтрован
    expect(out.results).toHaveLength(1);
    expect(out.results[0].name).toBe('Frontend-разработчик (Платформа)');
    expect(out.results[0].action).toBeDefined();
  });

  it('yandex: server-side professions filter, all results pass through', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => YANDEX_FIXTURE });

    const out = await runYandex({ limit: 10 });

    expect(out.ok).toBe(true);
    expect(out.scanned).toBe(2);
    expect(out.candidates).toBe(2);
    expect(out.results).toHaveLength(2);
  });

  it('ozon: filters by title field, ignores backend', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => OZON_FIXTURE });

    const out = await runOzon({ limit: 10 });

    expect(out.ok).toBe(true);
    expect(out.scanned).toBe(2);
    expect(out.candidates).toBe(1);
    expect(out.results[0].name).toBe('Frontend-разработчик');
  });

  it('avito: scrapes cheerio HTML, filters by title', async () => {
    fetchSpy.mockResolvedValue({ ok: true, text: async () => AVITO_FIXTURE });

    const out = await runAvito({ limit: 10 });

    expect(out.ok).toBe(true);
    expect(out.scanned).toBe(2);
    expect(out.candidates).toBe(1);
    expect(out.results[0].title).toBe('Frontend-разработчик');
  });

  it('sber: paginated fetch, filters by title', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => SBER_FIXTURE });

    const out = await runSber({ limit: 10 });

    expect(out.ok).toBe(true);
    expect(out.scanned).toBe(2);
    expect(out.candidates).toBe(1);
    expect(out.results[0].name).toBe('Frontend-разработчик (React)');
  });

  it('tbank: scrapes __TRAMVAI_STATE__ SSR blob, filters by title', async () => {
    fetchSpy.mockResolvedValue({ ok: true, text: async () => TBANK_FIXTURE });

    const out = await runTbank({ limit: 10 });

    expect(out.ok).toBe(true);
    expect(out.scanned).toBe(2);
    expect(out.candidates).toBe(1);
    expect(out.results[0].name).toBe('Frontend-разработчик');
  });

  it('beeline: filters by role taxonomy field', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => BEELINE_FIXTURE });

    const out = await runBeeline({ limit: 10 });

    expect(out.ok).toBe(true);
    expect(out.scanned).toBe(2);
    expect(out.candidates).toBe(1);
    expect(out.results[0].name).toBe('Frontend разработчик');
  });

  it('cloudru: filters by position field, skips closed vacancies', async () => {
    fetchSpy.mockResolvedValue({ ok: true, json: async () => CLOUDRU_FIXTURE });

    const out = await runCloudru({ limit: 10 });

    expect(out.ok).toBe(true);
    expect(out.scanned).toBe(3);
    expect(out.candidates).toBe(1); // closed frontend vacancy excluded
    expect(out.results[0].name).toBe('Frontend разработчик');
  });
});
