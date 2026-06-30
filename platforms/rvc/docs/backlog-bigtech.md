# Backlog: таблица Big Tech career sites

> **Не в scope job-hub сейчас.** HH и LinkedIn уже закрыты отдельными воркерами. Этот документ — идея на будущее.

## Цель

Единая таблица (Notion / SQLite / CSV) с карьерными страницами крупных компаний:

| company | careers_url | apply_type | region_filter | notes |
|---------|-------------|------------|---------------|-------|
| Google | … | form | EU | … |

## Что хотим автоматизировать позже

1. Парсинг списка вакансий по ключам (Frontend, React, Berlin, Remote EU).
2. Очередь как в job-hub (fit score, dedupe).
3. Полуавто: заполнение форм + резюме + cover letter.
4. Учёт лимитов (не спамить одну компанию).

## Ограничения

- Много сайтов с captcha / SSO / anti-bot — реалистично 30–50% semi-auto.
- Не дублировать HH (`hh-worker`) и LinkedIn (`li-worker`).

## Связь с job-hub

Когда будет готов список — добавить адаптер `adapters/bigtech-scrape.js` и секцию в `sources.yaml`, либо отдельный worker с общей SQLite `job-hub.db`.
