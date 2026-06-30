# systemd

```bash
# Установка (пример)
cp deploy/systemd/job-hub-monitor.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now job-hub-monitor.service
```

Перед запуском:

1. `cp credentials.env.example credentials.env` и заполнить.
2. `npm install` в корне rvc-applicant.
3. Убедиться что `hh-worker` и `li-worker` уже крутятся отдельно — hub их не заменяет.

Опционально Playwright для form-apply: `npm i playwright && npx playwright install chromium`.
