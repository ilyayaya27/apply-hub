# Изменения (Changelog)

## 2026-07-01

- 🌐 **rvc.global интеграция** (`platforms/apply/workers/rvc-global.js`): JWT API → извлечение apply URL из HTML описаний → роут на Playwright career-адаптеры → state в `data/rvc-global-state.json`. CLI: `node cli.js rvc-global-apply [--dry-run] [limit]`.
- ⏰ **rvc-global-worker.timer** — автозапуск каждые 6 часов, oneshot-сервис.
- 🤖 **OpenRouter AI** (gpt-4o-mini) вместо Groq для HH.ru cover letters и chat replies. Node.js career-адаптеры тоже читают ключ через `config.js`. Groq retry ограничен 60s (был 44 мин при 429).
- 📋 **ai-screening.js** — AI-ответы на скрининговые вопросы в career-формах (textarea без распознанного ключа = вопрос работодателя → OpenRouter/Groq).
- 🏢 **Новые career-платформы**: `beeline_careers`, `cloudru_careers` (allowAutoSubmit=true), `alfabank_careers`, `moysklad_careers`.
- 📱 **Телефон** в `profile.yaml` (`+79958890127`) — заполняется в формах.
- 📊 **LinkedIn мониторинг** — после каждого цикла в лог пишется сводка: applied/failed/connects total + today.
- 📊 **daily-digest.sh** — ежедневная сводка в 9:00 по HH.ru / LinkedIn / rvc.global; отправляет в Telegram при наличии `TELEGRAM_NOTIFY_BOT_TOKEN`.
- 🔧 **hh-worker.service**: `Restart=on-failure` → `Restart=always` — воркер больше не зависает после SIGTERM.
- 🔼 **LinkedIn квоты**: 5→15 Easy Apply/день, 1→3/цикл, 90→60 мин цикл. Локации: добавлен `Europe`. Дата: `Past 24h` → `Past Week`.

---

Обновления форка **hh-applicant-tool** (менторская программа IT Птица).
Чтобы обновиться — в папке проекта выполни `git pull`.

Записи сгруппированы по дате.

---

## 2026-06-28

- 📬 **Telegram → apply pipeline (фазы 1–2):** harvest прогоняет посты через `platforms/apply` (dry-run / live queue), `telegram-worker.sh` + `systemd/telegram-worker.service` (цикл harvest → human digest notify), audit CLI и `scripts/telegram-apply-audit.sh`, JSONL `external-skips` для hh/linkedin из TG-постов, human digest в отчёте и через бота (`NOTIFY_ON=needs_human`).
- 🔧 **SSOT credentials:** `platforms/apply/credentials.env` (SMTP, `APPLY_DRY_RUN`, `AUTO_APPLY`) подхватывают `telegram-worker.sh` и `telegram-harvest.sh`; apply CLI читает тот же файл.
- 💬 **Авто-скрининг в чатах hh:** `reply-employers --ai` отвечает на анкеты по SSOT-правилам (`contacts`, `screening_rules`, `reply_chat` в конфиге), дописывает `https://t.me/ilyayaya27`, без `__SKIP__`. Обёртка `./reply-employers.sh` включает AI по умолчанию.
- 📄 **`spawn-resume-variants`:** клон опубликованного резюме + AI-перефразирование title/skills/описаний опыта (`--dry-run` для проверки).
- 🔗 Контакты в репо приведены к `@ilyayaya27` / GitHub `ilyayaya27`.

---

## 2026-06-26

- 🤖 **Скил `hh-clicker` для AI-агентов** (`.claude/skills/hh-clicker/`) + `AGENTS.md`. Теперь, открыв клонированный репозиторий в Claude Code, агент сразу получает пошаговый плейбук: установка, авторизация, AI-письма, рассылка, стратегия, грабли.
- 🆓 **Groq как бесплатная альтернатива OpenRouter** для AI-писем (GUIDE §6.2-альт). Ключ — на [console.groq.com/keys](https://console.groq.com/keys).
- 🐛 **Фикс краша `--excluded-filter`** (`'NoneType' object has no attribute 'group'`): на странице вакансии без описания (редирект на логин/капча) больше не падает.
- 🔇 **Убран спам-warning «обновите версию»** (форк намеренно отстаёт от upstream) — заодно перестал ломать JSON у `call-api`.
- ⚙️ Мелочи: строчная буферизация stdout (фон не выглядит зависшим); понятнее статусы dry-run и `test-session`; путь конфига для macOS/Windows в GUIDE.
- 📝 Заметка в GUIDE §13 и скиле: `--excluded-filter` работает медленно (читает каждую вакансию) — долгое «🚀 Начинаю рассылку…» это не зависание; для прогресса — `-vv`. По итогам теста чистой установки.

---

## 2026-06-18

- 🐛 **Фикс: бот больше не пишет в чат, если работодатель не отвечал.**
  Раньше `reply-employers` слал ответ даже на **непросмотренный** отклик (работодатель молчал), а AI выдумывал «Спасибо за ваш ответ…»; крон повторял это каждый запуск. Теперь отвечаем **только когда работодатель реально написал последним**.

---

## 2026-06-09

- 🆕 **Анализ отказов — `analyze_rejections.py`.**
  Показывает, какие отказы «быстрые» (сработал автофильтр — поможет докрутка резюме) и «медленные» (резюме смотрел человек), а также каких требуемых навыков нет в твоём резюме.
  Запуск: `.venv/bin/python analyze_rejections.py`. Подробно — `GUIDE.md`, §16.
- 🛠 **Вакансии с тестами снова работают.**
  Раньше отклики на вакансии с тестом падали с «tests not found» (hh поменял структуру страницы). Парсер исправлен.
- ⚠️ **Понятная ошибка про веб-сессию.**
  Если тесты/капча перестали работать — теперь явно пишет «переавторизуйтесь», а не непонятное «tests not found».
  Помни: веб-сессия (для тестов и капчи) живёт ~2 недели и требует `authorize` заново. API-токен (для самих откликов) обновляется сам, а веб-куки — нет.

---

## 2026-06-08 — базовая версия форка

- 🚀 **Быстрый старт** в начале `GUIDE.md` (clone → install → auth → letter → apply).
- ✉️ **AI-адаптация письма**: AI подгоняет твоё базовое `letter.txt` под вакансию, а не пишет с нуля (меньше выдумок).
- 🧹 **Фильтр вакансий + ревью чёрного списка**: `--excluded-filter` по названию и описанию; сохраняется сработавшее слово (`matched`) для тюнинга. См. §14.
- ⏳ **Человекоподобные паузы** между откликами: `--apply-delay-min` / `--apply-delay-max`. См. §13.
- 💬 **Ответы в чатах (`reply-employers --ai`)**: AI отвечает по фактам из резюме и **пропускает анкеты** (зарплата/график/тестовое) — их обрабатываешь вручную.
- ⚠️ **Раздел «На что обращать внимание»** (`GUIDE.md` §15): лимиты, безопасность ключей, аккаунты/IP, лицензия.
