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
| 3 | `yandex_careers` | https://yandex.ru/jobs/vacancies/razrabotchik-frontenda-v-direkt-45243 | ❌ | — | требует Яндекс-авторизацию — `login-once yandex_careers`, потом smoke |
| 4 | `ozon_careers` | https://career.ozon.ru/vacancy/ml-inzhener-133392771 | ✅ | — | smoke 2026-06: formless, 4 поля + resume; headless OK |
| 5 | `avito_careers` | https://career.avito.com/vacancies/razrabotka/19604/ | ✅ | — | 13 полей + resume; Bitrix форма, CORP_RU; `allowAutoSubmit: true` |
| 6 | `sber_careers` | https://rabota.sber.ru/search/frontend-razrabotchik-react-4508788/ | ✅ | — | formless + pageSettleMs 8s; 4 поля + resume; `allowAutoSubmit: false` — проверить headed |
| 7 | `tbank_careers` | _TBD tbank.ru/career_ | ⬜ | — | SPA с lazy URLs — нужен ручной поиск вакансии через браузер |
| 8 | `habr_career` | _TBD_ | ⬜ | — | требует логин → `login-once habr_career` |
| 9 | `djinni` | _TBD_ | ⬜ | — | требует логин → `login-once djinni` |
| 10 | `getmatch` | _TBD_ | ⬜ | — | |
| 11 | `hirehi` | _TBD_ | ⬜ | — | |
| 12 | `jobrockets` | _TBD_ | ⬜ | — | |

Легенда: ⬜ не проверено · ⏳ в работе · ✅ fill-only OK · ❌ needs_human (капча/логин/разметка)

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
