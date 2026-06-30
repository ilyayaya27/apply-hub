# Career-площадки — как устроен auto-apply (для агентов)

Документ описывает **полный путь** от ссылки в Telegram до fill-only/submit на сайтах вроде VK, RWB, Yandex, Ozon. Читать вместе с [`README.md`](../README.md) и [`CAREER_SMOKE.md`](./CAREER_SMOKE.md).

## Что к чему (big picture)

```
Telegram harvest          apply pipeline (platforms/apply)
─────────────────         ───────────────────────────────
пост + ссылки      →      enqueue (stdin JSON)
                          │
                          ├─ fit / exclusions (#резюме, min_fit_score)
                          ├─ classifyApplyRoute()  ← router.js
                          │     career URL → route: "form"
                          │
                          └─ SQLite queue (vacancies)
                                    │
                     apply-next     ▼
                          workers/form-apply.js
                                    │
                          resolvePlatformAdapter(url)  ← registry.js
                                    │
                          applyCareerForm()  ← career-form.js
                                    │
                          Playwright: goto → «Откликнуться» → fill → (submit?)
```

**SSOT (Single Source of Truth):**

| Что | Файл |
|-----|------|
| URL → `platform_id` | `adapters/platforms/hosts.js` (`CAREER_PLATFORMS`) |
| Селекторы кнопок, wait, antibot | `adapters/platforms/specs.js` |
| Список источников для audit | `sources.yaml` |
| Профиль (email, telegram, resume) | `profile.yaml` + `lib/form-profile.js` |
| Матчинг полей формы | `lib/form-field-hints.js` |

**Не дублировать** хосты в router/workers — только `hosts.js` + `careerPlatformId(url)`.

## Маршрутизация

`lib/router.js` → `classifyApplyRoute(links)`:

- `hh.ru`, `linkedin.com` → `skip_external` (отдельные воркеры хаба)
- Хост из `CAREER_PLATFORMS` → `form` + `platformId`
- Google Forms / forms.gle → `form` (generic `html-form.js`)
- mailto → `email`
- иначе → `manual` / `needs_human`

После добавления хоста в SSOT старые записи в БД чинятся:

```bash
node cli.js repair-career-routes --apply
```

## Career adapter stack

1. **`registry.js`** — `resolvePlatformAdapter(url)` → `{ id, apply }` или fallback на generic HTML form.
2. **`career-form.js`** — единый Playwright-flow для всех `*_careers`:
   - launch browser (опционально `browserUserAgent`, `browserArgs` из spec)
   - `goto` + `pageSettleMs` (antibot, Ozon)
   - `openCareerApplyForm()` — клик по `applyButtonSelectors`
   - snapshot HTML → plan fill
   - `runHtmlFormFlow()` — fill + optional submit
3. **`html-form.js`** — два режима планирования:
   - **classic:** `<form>` + `name=` атрибуты → `planFormFillFromHtml`
   - **formless:** Vue/modals без `<form>` (Ozon) → `planFormFillFormlessFromHtml` (placeholder/id)

## Статусы после apply

| `FORM_SUBMIT` | Результат | Очередь |
|---------------|-----------|---------|
| `0` | `fill_only` — поля заполнены, submit не жмём | vacancy остаётся `queued` |
| `1` | `applied` при успешном клике submit | `applied` |
| любой | `needs_human` — капча, логin, разметка | human review |

Smoke **всегда** с `FORM_SUBMIT=0`.

## Как добавить новую площадку

1. **`hosts.js`** — `{ id: 'foo_careers', pattern: /host\.example/i }`
2. **`specs.js`** — селекторы:
   ```js
   foo_careers: {
     applyButtonSelectors: ['button:has-text("Откликнуться")', ...],
     waitFor: 'form, input[type="email"]',
     submitSelectors: ['button[type="submit"]'],
     // опционально:
     formless: true,
     pageSettleMs: 12000,
     browserUserAgent: '...',
     browserArgs: ['--disable-blink-features=AutomationControlled'],
   }
   ```
3. **`sources.yaml`** — запись для audit/metrics
4. **Тесты** — URL в `tests/router.test.js`, `tests/platform-registry.test.js`
5. **Smoke** — живая vacancy URL в `lib/career-smoke-probes.js` + строка в `CAREER_SMOKE.md`
6. `npm test` → `career-smoke '<url>'`

Если стандартный `<form>` не находится — включить `formless: true` и проверить placeholder'ы в headed (`PLAYWRIGHT_HEADLESS=0`).

## Известные особенности (2026-06)

### Ozon (`ozon_careers`)

- **IT/офис:** `career.ozon.ru/vacancy/...`
- **НЕ путать** с `job.ozon.ru` — Ozon Job (склад, курьер), antibot, не для этого pipeline.
- Antibot: нужны UA + пауза `pageSettleMs: 12000` (headless проходит smoke 2026-06).
- Форма в Vue-модалке **без `<form>`**, поля без `name` — только `formless` + placeholder (`Фамилия`, `Имя`, `Email`, `Telegram`, file upload).
- Smoke fill-only: фамилия, имя, email, telegram + `resumeUploaded: true` (телефон/consent — проверить в headed перед submit).
- Probe: `https://career.ozon.ru/vacancy/ml-inzhener-133392771`

### Yandex (`yandex_careers`)

- Smoke: ❌ `no_form` — нужны кастомные селекторы модалки (как у Ozon, возможно `formless`).

### RWB / VK

- ✅ fill-only на generic `CORP_RU` spec (обычный `<form>`).

## CLI шпаргалка

```bash
cd platforms/apply

# unit-тесты (обязательно перед коммитом)
npm test

# smoke одной площадки
PLAYWRIGHT_ENABLED=1 FORM_SUBMIT=0 PLAYWRIGHT_HEADLESS=0 \
  node cli.js career-smoke 'https://career.ozon.ru/vacancy/ml-inzhener-133392771'

# все probes (останавливается на первой ошибке — Yandex может блокировать --all)
PLAYWRIGHT_ENABLED=1 FORM_SUBMIT=0 node cli.js career-smoke --all
```

## Env

См. [`README.md`](../README.md). Критичные для career:

- `PLAYWRIGHT_ENABLED=1`
- `FORM_SUBMIT=0` (smoke / безопасный fill)
- `PLAYWRIGHT_HEADLESS=0|1`
- `RESUME_PATH` или `profile.yaml` → `market_assets.ru.resume_path`

## Файлы по слоям

```
platforms/apply/
├── cli.js                    # career-smoke, repair-career-routes, enqueue, apply-next
├── lib/
│   ├── router.js             # classifyApplyRoute
│   ├── career-smoke-probes.js
│   ├── form-field-hints.js   # email, phone, firstName, lastName, …
│   └── form-profile.js
├── workers/form-apply.js
├── adapters/
│   ├── platforms/
│   │   ├── hosts.js          # SSOT URL → platform_id
│   │   ├── specs.js          # Playwright селекторы per platform
│   │   ├── career-form.js    # career apply flow
│   │   └── registry.js
│   └── forms/html-form.js    # plan + fill (classic + formless)
└── docs/
    ├── CAREER_PLATFORMS.md   # этот файл
    └── CAREER_SMOKE.md       # таблица результатов smoke
```

## Что мы делали в сессии Ozon (контекст)

1. Обнаружили, что в SSOT был **`job.ozon.ru`** — это gig-вакансии, antibot 403.
2. Корпоративные IT — **`career.ozon.ru`**; исправили `hosts.js`, `sources.yaml`, тесты.
3. Ozon открывает модалку «Откликнуться» → поля без `<form>`/`name` → добавили **formless** fill по placeholder.
4. В `specs.js` для `ozon_careers`: antibot UA, `pageSettleMs`, `formless: true`, submit «Отправить отклик».
5. Smoke + документация для следующих агентов.
