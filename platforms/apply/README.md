# Apply pipeline (vendored from rvc-applicant)

Маршрутизация откликов по ссылкам из harvest-постов: form, email, hh/linkedin (skip), и т.д.  
**Фаза 1:** dry-run — реальных откликов нет.  
**Фаза 2:** `APPLY_DRY_RUN=0` + `AUTO_APPLY=1` — постановка в очередь и `apply-next` после harvest (form/email).

## Зависимости

```bash
cd platforms/apply
npm install
```

Node 22+ (используется `node:sqlite`).

## CLI

```bash
# из stdin (контракт harvest bridge)
echo '{"sourceId":"telegram:test","postId":"1","postUrl":"https://t.me/test/1","rawText":"…","links":["https://forms.gle/…"],"dryRun":false,"skipFitCheck":true}' \
  | node cli.js enqueue --stdin

# обработать очередь (до N записей)
node cli.js apply-next 5

# fixture для отладки
node cli.js enqueue-dry-run tests/fixtures/harvest-post-form.json

# метрики очереди (funnel + by platform)
node cli.js audit
node cli.js audit path/to/harvest-latest.json --json
```

Stdout: `{ "ok": true, "results": [{ "action", "route", "primaryUrl", "key", "hints", "postUrl" }] }`.

Действия: `would_apply`, `queued`, `skip_external`, `skip_seen`, `skip_fit`, `skip_resume_post`, `needs_human`, `error`.

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `APPLY_ROOT` | `platforms/apply` | Корень apply (для bridge) |
| `APPLY_DRY_RUN` | `1` | `0` — боевой режим (фаза 2+) |
| `AUTO_APPLY` | `0` | Авто-отклик без подтверждения |
| `COVER_LETTER_PATH` | `../../letter.txt` | SSOT сопроводительного |
| `FORM_SUBMIT` | `0` | `1` — реальная отправка форм (Playwright) |
| `PLAYWRIGHT_ENABLED` | `0` | `1` — заполнение career/form через браузер |

Профиль: `profile.yaml` (из rvc-applicant).

## Интеграция с Telegram harvest

При `APPLY_ENABLED=1` harvest после каждого матча вызывает `enqueue` (live при `APPLY_DRY_RUN=0`, иначе dry-run). При `AUTO_APPLY=1` и live — после цикла `apply-next`. Секция в отчёте: **Dry-run apply** или **Apply queue (live)**.

## Тесты

```bash
npm test
```

## Фазы (roadmap)

1. **Dry-run** — классификация + отчёт ✅
2. **Live queue + guards** — `APPLY_DRY_RUN=0`, `AUTO_APPLY=1`, form/email workers; фильтр `#резюме` ✅
3. **Career adapters** — Playwright-first (`specs.js` + `career-form.js`) для VK, Habr, Djinni, Getmatch, HireHi, JobRockets ✅
4. **Метрики** — funnel + by platform в `audit` ✅
5. **Live form fill** — `PLAYWRIGHT_ENABLED=1`, `FORM_SUBMIT=0`, прогон `apply-next` на real URLs из очереди
