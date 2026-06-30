# Заметки для AI-агента (Claude Code и совместимые)

Это **хаб откликов**: hh.ru + LinkedIn Easy Apply + Telegram harvest (форк `hh-applicant-tool`, менторская программа IT Птица).

## Как управлять
- **HH:** скил **`hh-clicker`** — `.claude/skills/hh-clicker/SKILL.md` (авторизация, AI-письма, отклики, чаты, поднятие резюме).
- **LinkedIn:** `platforms/linkedin/`, **`platforms/linkedin/README.md`**. Перед боевым apply — `dryRun = True` в `config.py`.
- **Telegram:** `platforms/telegram/`, **`platforms/telegram/README.md`**. Разово: `./telegram-harvest.sh`. Фон: `./telegram-worker.sh` / `systemctl --user start telegram-worker`. SMTP/apply: `platforms/apply/credentials.env` (шаблон `credentials.env.example`).
- **Apply (career/form):** `platforms/apply/`, **`platforms/apply/README.md`**. Career SSOT + smoke: **`platforms/apply/docs/CAREER_PLATFORMS.md`**, **`platforms/apply/docs/CAREER_SMOKE.md`**. Fill-only smoke: `PLAYWRIGHT_ENABLED=1 FORM_SUBMIT=0 node cli.js career-smoke '<url>'`.

## Документация
- **`GUIDE.md`** — HH (быстрый старт — вверху).
- **`platforms/linkedin/README.md`** — LinkedIn (квоты, orchestrator, systemd).
- **`platforms/telegram/README.md`** — Telegram harvest (GramJS).
- **`platforms/apply/docs/CAREER_PLATFORMS.md`** — Telegram → queue → Playwright career auto-apply (для агентов).
- **`CHANGELOG.md`** — что менялось по датам.

## 🥇 Главное правило
**Перед любой массовой рассылкой — `--dry-run` (HH), `dryRun = True` (LinkedIn), `APPLY_DRY_RUN=1` (Telegram/apply).** Реальные отклики не отзываются.

## Запуск
- HH: `.venv/bin/python -m hh_applicant_tool <команда>`
- LinkedIn один цикл: `.venv/bin/python -m hh_applicant_tool linkedin-orchestrator` или `./linkedin-orchestrator.sh`
- LinkedIn фон: `./linkedin-worker.sh` / `systemctl --user start linkedin-worker`
- Telegram фон: `./telegram-worker.sh` / `systemctl --user start telegram-worker`
- Apply аудит: `./scripts/telegram-apply-audit.sh`
- LinkedIn deps: `pip install -e '.[linkedin]'`
