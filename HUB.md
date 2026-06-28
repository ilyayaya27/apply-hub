# Хаб откликов (HH + LinkedIn)

Личный форк на базе [hh-applicant-tool](https://github.com/it-ptitsa/hh-applicant-tool) (IT Птица): один репозиторий, одна venv, две площадки.

| Площадка | Где код | Запуск |
|----------|---------|--------|
| **hh.ru** | `src/hh_applicant_tool/` | `.venv/bin/python -m hh_applicant_tool …` |
| **LinkedIn Easy Apply** | `platforms/linkedin/` | `./linkedin-orchestrator.sh` или `linkedin-orchestrator` |

## Безопасность

- HH: всегда сначала `--dry-run`.
- LinkedIn: `dryRun` / `connectDryRun` в `platforms/linkedin/config.py`.
- Секреты и cookies только локально (`config_secrets.py`, `data/`, `cookies/` — в `.gitignore`).

## Документация

- [GUIDE.md](./GUIDE.md) — HH
- [platforms/linkedin/README.md](./platforms/linkedin/README.md) — LinkedIn
- [AGENTS.md](./AGENTS.md) — заметки для AI-агента

## Автomation

```bash
pip install -e '.[linkedin]'   # или .[playwright,pillow] для HH
./install-automation.sh all    # systemd: hh-worker + linkedin-worker
```

Freelance (Kwork, FL.ru, rvc-applicant) — **отдельные** репозитории, сюда не входят.
