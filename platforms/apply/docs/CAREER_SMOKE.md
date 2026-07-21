# Career smoke — проверка fill-only по площадкам

Цель: для каждой career-площадки из SSOT (`adapters/platforms/hosts.js`) убедиться, что Playwright открывает вакансию, находит форму, заполняет поля и (опционально) грузит резюме. **Без submit** до явного OK (`FORM_SUBMIT=1`).

## Команда

```bash
cd platforms/apply
export PLAYWRIGHT_ENABLED=1 FORM_SUBMIT=0 PLAYWRIGHT_HEADLESS=1

# одна URL
node cli.js career-smoke 'https://career.rwb.ru/vacancies/25895'

# все probe URL из таблицы ниже (по порядку, останавливается на первой ошибке)
node cli.js career-smoke --all
```

Stdout: JSON `{ ok, status, adapter, note, plan?, error? }`.

## Порядок прохода (как в `hosts.js`)

| # | platform_id | probe URL | fill-only | submit | notes |
|---|-------------|-----------|-----------|--------|-------|
| 1 | `vk_careers` | https://internship.vk.company/vacancy/1374 | ✅ | — | smoke 2026-06 |
| 2 | `rwb_careers` | https://career.rwb.ru/vacancies/25895 | ✅ | — | 6 полей + resume; phone пустой — проверить профиль |
| 3 | `yandex_careers` | https://yandex.ru/jobs/vacancies/razrabotchik-interfeysov-v-datalens-17333 | ✅ | ✅ | smoke 2026-07-02: 4 поля + resume, сессия login-once; старый probe URL протух (нет кнопки отклика) |
| 4 | `ozon_careers` | https://career.ozon.ru/vacancy/ml-inzhener-133392771 | ✅ | — | smoke 2026-06: formless, 4 поля + resume; headless OK |
| 5 | `avito_careers` | https://career.avito.com/vacancies/razrabotka/19604/ | ✅ | — | 13 полей + resume; Bitrix форма, CORP_RU; `allowAutoSubmit: true` |
| 6 | `sber_careers` | https://rabota.sber.ru/search/frontend-razrabotchik-react-4508788/ | ✅ | — | formless + pageSettleMs 8s; 4 поля + resume; `allowAutoSubmit: false` — проверить headed |
| 7 | `tbank_careers` | tbank.ru/career | ✅ | — | smoke OK 09.07.2026 |
| 8 | `habr_career` | _TBD_ | ⬜ | — | требует логин → `login-once habr_career`; **не выполнено**: сессии `sessions/habr_career.json` нет, `login-once.js` требует интерактивного логина человеком (headed браузер) — нельзя пройти headless/от имени агента |
| 9 | `djinni` | https://djinni.co/jobs/811522-front-end-developer/ | ✅ | — | smoke 2026-07-11: сессия login-once уже есть (`sessions/djinni.json`), formless-модал, 1 поле (cover letter, AI-generated); `allowAutoSubmit: true` уже стоял в specs.js — доки были не синхронизированы, это чисто doc-fix |
| 10 | `getmatch` | https://getmatch.ru/vacancies/34997-frontend-razrabotchik-v-komandu-crm | ✅ | — | smoke 2026-07-11: сессия login-once уже есть (`sessions/getmatch.json`), 3 поля (salary/city/cover letter); первые 2 probe-кандидата (4381, 16020) оказались архивными вакансиями («в архиве, не принимает отклики») — no_form, это ожидаемо для протухшего URL, не баг адаптера; `allowAutoSubmit` осознанно оставлен `false` — нужен ручной headed-просмотр |
| 11 | `hirehi` | https://hirehi.ru/development/frontend-razrabotchik-62798 | ❌ | — | **needs_human (login wall)**: без UA/antibot-args сайт отдаёт `403 Forbidden` на headless Playwright — добавлен `browserArgs`/`browserUserAgent` в specs.js (как у CORP_RU) чисто для диагностики. С обходом antibot клик «Откликнуться» открывает модалку «Доступно после регистрации» — anonymous apply не существует, нужен аккаунт. **Важно**: с текущим спеком (`waitFor: 'form'`) form-filler находит скрытую login-форму (email/password) и технически репортит `fill_only` — это false positive (заполняется поле логина, а не заявка). Не добавлять в `career-smoke-probes.js`, пока это не отфильтровано явно. |
| 12 | `jobrockets` | — | 💀 | — | **deprecated**: `jobrockets.ru` не резолвится (`host jobrockets.ru` → NXDOMAIN), домен мёртв — уже было известно по аналогии с `platforms/rvc`. Удалён из `adapters/platforms/hosts.js` (роутинг) и `adapters/platforms/specs.js` (спек), в `sources.yaml` помечен `enabled: false, automation_tier: deprecated`. Тесты (`platform-registry`, `career-form`, `sources`) обновлены под удаление, весь набор (74 теста) зелёный. |
| 13 | `moysklad_careers` | https://www.moysklad.ru/company/careers/vacancy/senior-developer-bitrix/ | ✅ | — | smoke 2026-07-11: старый комментарий «form не найдена» был неверным — на странице вакансии реально есть Bitrix web-form (name/phone/email/citizenship/city/резюме-ссылка/чекбокс согласия), без логина. Изначально fill_only заполнял только 3 поля (имя/email/чекбокс) — телефон и ссылка на резюме терялись, т.к. `planFormFillFormlessFromHtml` матчил только placeholder/aria-label/name, а не `<label for>`, а у телефона placeholder — просто формат-пример («+7 (9123) 456-78-90»), без слова «телефон». 13.07: добавлен приоритет `<label for=id>` над placeholder (общий фикс для всех formless-адаптеров) + `contact.portfolio` в `profile.yaml` — теперь fill_only закрывает 5 полей (имя/телефон/email/ссылка-резюме/чекбокс). `allowAutoSubmit` оставлен `false` — нужен headed-просмотр. |
| 14 | `alfabank_careers` | — | ❌ | — | **needs_human**: `job.alfabank.ru` — lead-gen страница, не job-board с прямым apply. `/vacancies` рендерит JS-список (сейчас 5 вакансий, все sales/delivery — нет IT/frontend), но без индивидуальных vacancy-URL и без `<form>` (0 forms) — только загрузка резюме для AI-мэтчинга и email-подписка на уведомления. Прямого apply-флоу для конкретной вакансии не существует в текущем виде сайта. |

Легенда: ⬜ не проверено · ⏳ в работе · ✅ fill-only OK · ❌ needs_human (капча/логин/разметка) · 💀 deprecated (мёртвый домен)

## Алгоритм на одну площадку

1. Найти **живую** vacancy URL (frontend / react / typescript).
2. `node cli.js career-smoke '<url>'` с `FORM_SUBMIT=0`.
3. Если `fill_only` — обновить таблицу ✅, при необходимости допилить `specs.js`.
4. Если `needs_human` — записать `error` в notes, кастомные селекторы / `needs_human` в очереди.
5. Только после ручного просмотра в headed: `PLAYWRIGHT_HEADLESS=0 FORM_SUBMIT=1` на тестовой вакансии (если есть).

## Починка очереди

```bash
node cli.js repair-career-routes        # dry-run
node cli.js repair-career-routes --apply
```

## Env

| Переменная | Smoke |
|------------|-------|
| `PLAYWRIGHT_ENABLED` | `1` |
| `FORM_SUBMIT` | `0` |
| `PLAYWRIGHT_HEADLESS` | `1` (для отладки `0`) |
| `RESUME_PATH` | путь к PDF |
