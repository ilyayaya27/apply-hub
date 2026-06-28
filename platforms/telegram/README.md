# Telegram job harvest

Часть [apply-hub](../../): разовый сбор релевантных вакансий из Telegram-каналов (GramJS). Итог пишется в **`logs/harvest-latest.json`** (и строка в `logs/harvest-history.jsonl` для статистики по прогонам). В JSON есть `textReport` — человекочитаемый отчёт со ссылками на посты и hh/djinni.

## Зависимости

[Bun](https://bun.sh), API-ключи с [my.telegram.org](https://my.telegram.org).

```bash
cd platforms/telegram
bun install
cp .env.example .env
cp src/config/channels.example.json src/config/channels.json
```

## Запуск (из корня репо)

```bash
./telegram-ping.sh          # первый вход / проверка сессии
./telegram-harvest.sh       # сбор за 24 ч (HARVEST_HOURS)
./telegram-harvest.sh -- --hours 48
./telegram-diagnose.sh      # logs/diagnose.log
```

**Первый логин:** прокси и API-ключи клади в `platforms/telegram/.env` (не в командную строку). После `Connection … complete!` сразу появится `Телефон (+79123456789):` — не прерывай ^C. Опционально в `.env`: `TELEGRAM_PHONE=+79…`.

**Код не приходит?** GramJS по умолчанию шлёт код **в приложение Telegram** (служебный чат «Telegram»), **не SMS**. Открой Telegram на телефоне/Desktop с этим номером. Если чата нет: `TELEGRAM_FORCE_SMS=1` в `.env` и снова `./telegram-ping.sh`, или `./telegram-login-qr.sh` — в терминале появится ASCII QR; сканируй: **Настройки → Устройства → Подключить устройство**. Не прерывай скрипт (Ctrl+C) до подтверждения на телефоне.

Fish (если нужно разово переопределить env): `env TELEGRAM_PROXY_URL=socks5://127.0.0.1:10808 ./telegram-ping.sh` или `set -x TELEGRAM_PROXY_URL socks5://127.0.0.1:10808`.

Миграция из старого `~/Documents/tg-job-harvest`:

```bash
./scripts/migrate-telegram-from-tg-job-harvest.sh
```

## Конфиг

| Файл | В git |
|------|-------|
| `.env` | нет |
| `.telegram_session` | нет |
| `src/config/channels.json` | нет |
| `.seen_store.json` | нет |
| `logs/harvest-latest.json` | нет |
| `logs/harvest-history.jsonl` | нет |
| `src/config/matcher-rules.json` | да |

Подробнее про переменные — `.env.example` и исходный [README upstream](https://github.com/ilyayaya27/apply-hub/tree/it-ptitsa/platforms/telegram).

### Прокси (SOCKS)

Если Telegram напрямую недоступен, укажи SOCKS5 (как в системных настройках GNOME или `freelance-radar`):

```bash
TELEGRAM_PROXY_URL=socks5://127.0.0.1:10808
```

Приоритет: `TELEGRAM_PROXY_URL` → `ALL_PROXY` / `HTTPS_PROXY` → GNOME `org.gnome.system.proxy` (mode=manual, socks). При прокси **WSS отключается автоматически** (ограничение GramJS).

## Dry-run apply (фаза 1)

После harvest можно прогнать посты через `platforms/apply` без реальных откликов:

```bash
# platforms/telegram/.env
APPLY_ENABLED=1
# APPLY_DRY_RUN=1 — по умолчанию из platforms/apply/credentials.env (или export)
# APPLY_ROOT=../apply   # по умолчанию ../apply от cwd platforms/telegram
```

`telegram-harvest.sh` и worker автоматически подхватывают `platforms/apply/credentials.env`.

В `logs/harvest-latest.json` (поле `applyDryRun` и секция `textReport`) появится **«Dry-run apply (0 реальных откликов)»** — маршрут (form, hh, …) и ссылка на пост. HH/LinkedIn помечаются `[skip hh/li]` (их обрабатывают отдельные воркеры).

Сопроводительное письмо: корневой `letter.txt` (SSOT).

## Live apply (фаза 2)

Реальная постановка в очередь и авто-отклик form/email после harvest:

```bash
# platforms/telegram/.env
APPLY_ENABLED=1
APPLY_DRY_RUN=0
AUTO_APPLY=1
APPLY_BATCH_MAX=5
# FORM_SUBMIT=1
# PLAYWRIGHT_ENABLED=1
# SMTP_* для email-маршрута
```

Сначала один прогон с `APPLY_DRY_RUN=1`, затем переключай на `0`. В отчёте секция **«Apply queue (live)»** и метки `[queued]`. HH/LinkedIn по-прежнему `[skip hh/li]`.

Зависимости apply: `cd ../apply && npm install` (Playwright — optional, для form submit).

GramJS-сессия общая: по умолчанию `../apply-hub/platforms/telegram/.telegram_session` (см. `rvc-applicant/credentials.env` → `TELEGRAM_SESSION_FILE`).

## Фоновый worker (harvest + apply)

Как у LinkedIn: цикл harvest в рабочие часы (по умолчанию 9–20), пауза ~120 мин.

```bash
chmod +x telegram-worker.sh scripts/telegram-apply-audit.sh
./telegram-worker.sh
# или
systemctl --user enable --now telegram-worker.service   # из systemd/telegram-worker.service
```

Перед live:

1. `cp platforms/apply/credentials.env.example platforms/apply/credentials.env` — SMTP, `APPLY_DRY_RUN=0`, `AUTO_APPLY=1`, `NOTIFY_ON=needs_human` (опционально).
2. В `platforms/telegram/.env`: `APPLY_ENABLED=1`, при первом прогоне `APPLY_DRY_RUN=1`.
3. Заполнить `contact.email` в `platforms/apply/profile.yaml` для email-маршрута.

После каждого цикла worker вызывает `node platforms/apply/cli.js notify-harvest-digest` (ручная очередь в Telegram-бот, если настроен `TELEGRAM_NOTIFY_*`).

Аудит очереди и последнего harvest:

```bash
./scripts/telegram-apply-audit.sh
# или с явным путём к отчёту:
node platforms/apply/cli.js audit platforms/telegram/logs/harvest-latest.json
```

HH/LinkedIn из постов пишутся в `platforms/apply/data/external-skips.jsonl` (не дублируем отклики с hh/li воркерами).
