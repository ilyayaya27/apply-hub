# LinkedIn Easy Apply + Connect

Часть [apply-hub](../../): Selenium-бот (fork [wodsuz/EasyApplyJobsBot](https://github.com/wodsuz/EasyApplyJobsBot)).

- **Easy Apply** — отклики через shadow DOM
- **Connect** — инвайты hiring team с `connectNote`
- **Квоты** — `data/quotas.json`
- **Кэш** — `data/activity.json` (без повторных заходов на те же страницы)

## Миграция с `~/Documents/li-easy-apply`

```bash
OLD=~/Documents/li-easy-apply
NEW=~/Documents/apply-hub/platforms/linkedin

mkdir -p "$NEW/data" "$NEW/cookies" "$NEW/logs"
cp -a "$OLD/data/." "$NEW/data/" 2>/dev/null || true
cp -a "$OLD/cookies/." "$NEW/cookies/" 2>/dev/null || true
cp "$OLD/config_secrets.py" "$NEW/" 2>/dev/null || cp "$NEW/config_secrets.py.example" "$NEW/config_secrets.py"

cd ~/Documents/apply-hub
pip install -e '.[linkedin]'   # в существующий .venv

systemctl --user disable --now li-worker.service 2>/dev/null || true
./install-automation.sh linkedin
```

Старый репозиторий `li-easy-apply` после проверки можно архивировать/удалить.

## Установка (с нуля)

```bash
cd ~/Documents/apply-hub
pip install -e '.[linkedin]'

cp platforms/linkedin/config_secrets.py.example platforms/linkedin/config_secrets.py
# email/password LinkedIn

./linkedin-login-once.sh   # 2FA, профиль → platforms/linkedin/data/chrome-bot-profile/
```

Настрой фильтры и лимиты в `platforms/linkedin/config.py`. Для теста: `dryRun = True`, `connectDryRun = True`.

## Запуск

| Что | Команда |
|-----|---------|
| Один цикл | `./linkedin-orchestrator.sh` или `.venv/bin/python -m hh_applicant_tool linkedin-orchestrator` |
| Фон (systemd) | `./install-automation.sh linkedin` → `systemctl --user start linkedin-worker` |
| Логи | `tail -f platforms/linkedin/logs/orchestrator.log` |

Не гоняй вручную orchestrator, пока работает `linkedin-worker` — один Chrome-профиль.

## Квоты и отчёт

```bash
cd platforms/linkedin
../../.venv/bin/python activity-report.py
../../.venv/bin/python activity-report.py --backfill
```

## Тесты

```bash
cd platforms/linkedin
../../.venv/bin/python -m unittest test_activity.py test_quotas.py -v
```
