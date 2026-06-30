# rvc-applicant

Автоотклики на вакансии из Telegram-каналов (Revacancy и др.): парсинг постов → маршрутизация → очередь → заполнение форм через Playwright.

HH и LinkedIn **не трогаем** — для них отдельные инструменты (`hh-applicant-tool`, `li-easy-apply`).

## Поток

```
TG ingest (t.me/s или GramJS)
  → classifyApplyRoute (router.js)
  → fit score + store
  → apply-dispatcher (AUTO_APPLY)
       → form: detectFormAdapterId(url)
            → google-forms | html-form
            → Playwright fill
            → dry-run (по умолчанию) или submit (FORM_SUBMIT=true)
       → email: SMTP
  → needs_human / applied / failed
```

## Быстрый старт

```bash
cd /home/alice/Documents/rvc-applicant
cp credentials.env.example credentials.env
# отредактировать credentials.env

npm install
npx playwright install chromium   # для form apply

npm test
node cli.js monitor --once          # один проход мониторинга
node cli.js apply --dry-run         # прогон очереди без submit
```

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `RVC_CHANNEL` | `revacancy` | Канал для ingest |
| `AUTO_APPLY` | `true` | Авто form/email (false = только скан + уведомления) |
| `PLAYWRIGHT_ENABLED` | `false` | Включить браузер для form apply |
| `PLAYWRIGHT_HEADLESS` | `true` | Headless Chromium |
| `FORM_SUBMIT` | `false` | `true` = нажимать Submit (иначе только заполнение) |
| `COVER_LETTER_PATH` | hh-applicant-tool | SSOT сопроводительного |
| `RESUME_PATH` | hh-applicant-tool | SSOT резюме (PDF) |
| `APPLY_NAME` | `Ilya Silkin` | Имя в формах |
| `APPLY_EMAIL` | — | Email в формах и письмах |

Полный список — в `credentials.env.example`.

## Адаптеры форм

- **Google Forms** — `forms.gle`, `docs.google.com/forms`; многостраничные формы, загрузка резюме.
- **HTML form** — обычные `<form>` на careers/apply/jobs URL; план строится из HTML ответа `fetch()` (SPA без SSR могут не сработать).

Детекция: `adapters/forms/detect.js` → `detectFormAdapterId(url)`.

## SSOT профиля

Письмо и резюме читаются из **`/home/alice/Documents/hh-applicant-tool/`** (`lib/profile.js`, `lib/letter.js` в rvc-applicant). Не дублировать тексты в rvc-applicant.

## Тесты

```bash
npm test
```

- Unit: router, form-adapter, form-apply (cheerio plan)
- Integration (Playwright): `fixtures/google-form-mock.html`, `fixtures/simple-form.html`

Без установленного Playwright integration-тесты пропускаются.

## Безопасность

- По умолчанию **dry-run**: поля заполняются, Submit не нажимается → статус `needs_human`.
- Включать `FORM_SUBMIT=true` только после ручной проверки на тестовой форме.
- Лимиты: `MAX_APPLIES_PER_DAY`, `MAX_FORM_APPLIES_PER_DAY`, cooldown по компании.

## Smoke на реальной форме

```bash
PLAYWRIGHT_ENABLED=true FORM_SUBMIT=false node cli.js apply --limit 1
```

Проверить в браузере (`PLAYWRIGHT_HEADLESS=false`), затем при необходимости `FORM_SUBMIT=true`.
