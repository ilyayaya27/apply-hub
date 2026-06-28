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
| 3 | `yandex_careers` | https://yandex.ru/jobs/vacancies/razrabotchik-frontenda-v-direkt-45243 | ❌ | — | `no_form` — нужны селекторы «Откликнуться» / модалка |
| 4 | `ozon_careers` | _TBD job.ozon.ru_ | ⬜ | — | антибот |
| 5 | `avito_careers` | _TBD career.avito.com_ | ⬜ | — | |
| 6 | `sber_careers` | _TBD rabota.sber.ru_ | ⬜ | — | |
| 7 | `tbank_careers` | _TBD team.tbank.ru_ | ⬜ | — | |
| 8 | `habr_career` | _TBD_ | ⬜ | — | |
| 9 | `djinni` | _TBD_ | ⬜ | — | часто нужен логин |
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
