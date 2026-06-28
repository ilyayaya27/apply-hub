# Хаб откликов (HH + LinkedIn + Telegram)

Личный **GitHub fork** [apply-hub](https://github.com/ilyayaya27/apply-hub) ← upstream [it-ptitsa/hh-applicant-tool](https://github.com/it-ptitsa/hh-applicant-tool) (IT Птица): один репозиторий, одна venv (HH), Bun (Telegram), Selenium (LinkedIn).

### Git remotes (локально)

| Remote | Репозиторий |
|--------|-------------|
| `origin` | `ilyayaya27/apply-hub` — твой форк (push сюда) |
| `upstream` | `it-ptitsa/hh-applicant-tool` — обновления кликера от IT Птица |

Подтянуть изменения кликера без потери своих коммитов:

```bash
git fetch upstream
git checkout it-ptitsa
git merge upstream/it-ptitsa   # или rebase, если предпочитаешь линейную историю
git push origin it-ptitsa
```

| Площадка | Где код | Запуск |
|----------|---------|--------|
| **hh.ru** | `src/hh_applicant_tool/` | `.venv/bin/python -m hh_applicant_tool …` |
| **LinkedIn Easy Apply** | `platforms/linkedin/` | `./linkedin-orchestrator.sh` |
| **Telegram (сбор + apply)** | `platforms/telegram/` + `platforms/apply/` | `./telegram-harvest.sh`, `./telegram-worker.sh` |

## Безопасность

- HH: всегда сначала `--dry-run`.
- LinkedIn: `dryRun` / `connectDryRun` в `platforms/linkedin/config.py`.
- Telegram: `.env`, `.telegram_session`, `channels.json` — в `.gitignore`.
- Apply (email/form): `platforms/apply/credentials.env` — в `.gitignore`; шаблон `credentials.env.example`.

## Документация

- [GUIDE.md](./GUIDE.md) — HH
- [platforms/linkedin/README.md](./platforms/linkedin/README.md) — LinkedIn
- [platforms/telegram/README.md](./platforms/telegram/README.md) — Telegram harvest
- [AGENTS.md](./AGENTS.md) — заметки для AI-агента

## Автomation

```bash
pip install -e '.[linkedin]'   # HH + LinkedIn
cd platforms/telegram && bun install   # Telegram harvest
./install-automation.sh all    # systemd: hh-worker + linkedin-worker + telegram-worker
./scripts/telegram-apply-audit.sh   # очередь apply + human digest + external-skips
```

Freelance (Kwork, FL.ru, rvc-applicant) — **отдельные** репозитории, сюда не входят.
