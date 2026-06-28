# Заметки для AI-агента (Claude Code и совместимые)

Это **автокликер для hh.ru + LinkedIn Easy Apply** (форк `hh-applicant-tool`, менторская программа IT Птица).

## Как управлять
- **HH:** скил **`hh-clicker`** — `.claude/skills/hh-clicker/SKILL.md` (авторизация, AI-письма, отклики, чаты, поднятие резюме).
- **LinkedIn:** код в **`platforms/linkedin/`**, инструкция — **`platforms/linkedin/README.md`**. Перед боевым apply выставь `dryRun = True` в `platforms/linkedin/config.py`.

## Документация
- **`GUIDE.md`** — HH (быстрый старт — вверху).
- **`platforms/linkedin/README.md`** — LinkedIn (квоты, orchestrator, systemd).
- **`CHANGELOG.md`** — что менялось по датам.

## 🥇 Главное правило
**Перед любой массовой рассылкой — `--dry-run` (HH) или `dryRun = True` (LinkedIn).** Реальные отклики не отзываются.

## Запуск
- HH: `.venv/bin/python -m hh_applicant_tool <команда>`
- LinkedIn один цикл: `.venv/bin/python -m hh_applicant_tool linkedin-orchestrator` или `./linkedin-orchestrator.sh`
- LinkedIn фон: `./linkedin-worker.sh` / `systemctl --user start linkedin-worker`
- LinkedIn deps: `pip install -e '.[linkedin]'`
