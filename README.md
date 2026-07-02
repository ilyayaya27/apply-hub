# apply-hub

Автоматизированный хаб для откликов на вакансии. Одновременно работает на нескольких платформах: HH.ru, LinkedIn, Telegram-каналы, корпоративные career-сайты и rvc.global.

---

## Архитектура

```
apply-hub/
├── src/hh_applicant_tool/      # Python: HH.ru авто-отклики + уведомления
├── platforms/
│   ├── apply/                  # Node.js: career-сайты, rvc.global, email
│   ├── rvc/                    # Node.js: Telegram-каналы → scoring → форм-отклики
│   └── telegram/               # GramJS Telegram сессия (shared)
├── hh-worker.sh                # Shell-обёртка для hh-worker.service
└── systemd/                    # Шаблоны systemd unit-файлов
```

---

## Платформы и сервисы

### 1. HH.ru — `hh-worker.service`

**Что делает:** Автоматически откликается на свежие вакансии на hh.ru по фильтрам (React, TypeScript, remote). Обновляет токен, отправляет отклик с резюме, шлёт Telegram-уведомления.

**Технологии:** Python 3, `src/hh_applicant_tool/`, systemd oneshot-сервис по таймеру.

**Запуск вручную:**
```bash
cd /home/alice/Documents/apply-hub
source .env
python -m hh_applicant_tool
```

**Статус сервиса:**
```bash
systemctl --user status hh-worker.service
systemctl --user start hh-worker.service   # запустить прямо сейчас
journalctl --user -u hh-worker.service -f  # логи в реальном времени
```

**Конфиг:** `.env` в корне репозитория. Ключи: `HH_CLIENT_ID`, `HH_CLIENT_SECRET`, `HH_ACCESS_TOKEN`, `HH_REFRESH_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

---

### 2. LinkedIn — `linkedin-worker.service`

**Что делает:** LinkedIn Easy Apply через Selenium — автоматически применяет на вакансии с кнопкой Easy Apply.

**Технологии:** Python 3 + Selenium, виртуальное окружение `.venv/`.

**Статус:**
```bash
systemctl --user status linkedin-worker.service
journalctl --user -u linkedin-worker.service -f
```

---

### 3. Telegram-каналы → career-сайты — `job-hub-monitor.service`

**Что делает:** Мониторит Telegram-каналы с вакансиями (revacancy, g_jobbot, easy_frontend_jobs, remote_it), скорит каждую вакансию по профилю, ставит в очередь и автоматически откликается через Playwright.

**Технологии:** Node.js, GramJS (Telegram MTProto), SQLite, Playwright.

**Исходники:** `platforms/rvc/`

**Статус:**
```bash
systemctl --user status job-hub-monitor.service
journalctl --user -u job-hub-monitor.service -f
```

**Конфиг:** `platforms/rvc/credentials.env`
```
TG_INGEST_MODE=gramjs
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
TELEGRAM_SESSION_FILE=/path/to/.telegram_session
TELEGRAM_PROXY_URL=socks5://127.0.0.1:10808
AUTO_APPLY=true
PLAYWRIGHT_ENABLED=true
FORM_SUBMIT=true
JOB_HUB_DB=/path/to/job-hub.db
```

**Ручной запуск:**
```bash
cd platforms/rvc
node monitor/run.js
```

---

### 4. Career-сайты (Playwright) — `platforms/apply/`

**Что делает:** Открывает страницу вакансии, находит форму, заполняет поля (имя, email, телефон, резюме, cover letter), опционально сабмитит.

**Поддерживаемые платформы:**

| ID | Сайт | autoSubmit | Рынок |
|---|---|---|---|
| `rwb_careers` | career.rwb.ru (Wildberries) | ✅ | RU |
| `ozon_careers` | career.ozon.ru | ✅ | RU |
| `avito_careers` | career.avito.com | ✅ | RU |
| `beeline_careers` | job.beeline.ru | ✅ | RU |
| `cloudru_careers` | cloud.ru/career | ✅ | RU |
| `vk_careers` | team.vk.company | ✅ | RU |
| `sber_careers` | rabota.sber.ru | ✅ | RU |
| `yandex_careers` | yandex.ru/jobs | ✅ (нужен login-once) | RU |
| `tbank_careers` | team.tbank.ru | ❌ (TCP-блок) | RU |
| `alfabank_careers` | job.alfabank.ru | ❌ (форма за логином) | RU |
| `habr_career` | career.habr.com | ❌ (нужен login-once) | RU |
| `djinni` | djinni.co | ❌ (нужен login-once) | RU/INT |
| `getmatch` | getmatch.ru | ✅ (нужен login-once) | RU |

**CLI:**
```bash
cd platforms/apply
source credentials.env

# Smoke одной вакансии (без сабмита)
FORM_SUBMIT=0 node cli.js career-smoke 'https://career.rwb.ru/vacancies/12345'

# Smoke всех известных платформ
FORM_SUBMIT=0 node cli.js career-smoke --all

# Отклик через rvc.global матчи
node cli.js rvc-global-apply           # запуск (FORM_SUBMIT берётся из env)
node cli.js rvc-global-apply --dry-run # только показать, не отправлять
node cli.js rvc-global-apply 5         # максимум 5 вакансий

# GetMatch — стартапы, форма с cover letter
node cli.js getmatch-apply 10          # нужен sessions/getmatch.json

# HN Who Is Hiring — email к фаундерам + career-форма (без логина)
node cli.js hn-apply 30
node cli.js hn-apply 30 --dry-run

# Wellfound — стартапы (нужен sessions/wellfound.json)
node cli.js wellfound-apply 10

# Применить следующую вакансию из очереди (из Telegram-каналов)
node cli.js apply-next
node cli.js apply-next 3

# Аудит статистики
node cli.js audit
```

**Конфиг:** `platforms/apply/credentials.env`
```
AUTO_APPLY=1
PLAYWRIGHT_ENABLED=1
FORM_SUBMIT=1
APPLY_NAME="Ilya Zuev"
APPLY_EMAIL=ilyasilkin27@gmail.com
RVC_GLOBAL_TOKEN=eyJ...   # JWT из app.rvc.global localStorage
RVC_GLOBAL_API=https://api.rvc.global
```

**Профиль кандидата:** `platforms/apply/profile.yaml`
```yaml
name_ru: Илья Зуев          # для RU-платформ
name_en: Ilya Zuev          # для EN-платформ (Wellfound, HN Hiring)
active_market: ru
role: Frontend Developer
contact:
  email: ilyasilkin27@gmail.com
  phone: "+79958890127"
  telegram: "@ilyayaya27"
```

**Cover letter:**
- `letter.txt` — русский (HH.ru, career-сайты RU)
- `letter_en.txt` — английский (Wellfound, HN Hiring, международные стартапы)

---

### 5. HackerNews "Who is Hiring" — `hn-hiring-worker.timer`

**Что делает:** Ежедневно парсит тред «Ask HN: Who is hiring?» (текущий + прошлый месяц), фильтрует frontend + remote, пишет email основателям напрямую или откликается через career-форму.

**Не требует логина** — HN API публичный.

**Расписание:** каждый день в 10:00.

```bash
# Ручной запуск
cd platforms/apply && node cli.js hn-apply 30

# Статус таймера
systemctl --user status hn-hiring-worker.timer
journalctl --user -u hn-hiring-worker.service
```

**State:** `platforms/apply/data/hn-hiring-state.json`

---

### 6. GetMatch — `getmatch-worker.timer`

**Что делает:** Каждые 6 часов откликается на frontend-вакансии на getmatch.ru — заполняет salary (200k), city, cover letter и нажимает «Отправить отклик».

**Нужна сессия (один раз):**
```bash
node platforms/apply/login-once.js getmatch
```

**Расписание:** каждые 6 часов.

```bash
systemctl --user status getmatch-worker.timer
journalctl --user -u getmatch-worker.service
```

---

### 7. IT-Птица — `itptitsa-worker.timer` + `itptitsa-share.timer`

**Что делает (два воркера):**

**`itptitsa-process`** — мониторит топик "Контакты HR и Вакансии" (topic_id=33) в закрытой Telegram-группе IT-Птица. Извлекает HH.ru-ссылки (→ очередь откликов) и @username HR-ов (→ DM с резюме + реакция 👍). Лимит: 5 DM/день.

**`itptitsa-share`** — читает HR-переписки второго аккаунта (`@ilyailyailya27`), фильтрует свежие контакты (≤7 дней), пропускает закрытые вакансии и гео-отказы (РФ/РБ/локальные офисы), постит сводку одним сообщением в тот же топик от первого аккаунта.

**Сессии:** `platforms/telegram/.telegram_session` (основной) и `platforms/telegram/.telegram_session_work` (второй аккаунт). Второй залогинен через QR:
```bash
node platforms/telegram/login-second-account.mjs
```

**Расписание:**
- `itptitsa-worker.timer` — ежедневно 11:00
- `itptitsa-share.timer` — ежедневно 12:00

```bash
systemctl --user status itptitsa-worker.timer
systemctl --user status itptitsa-share.timer
journalctl --user -u itptitsa-share.service
```

**State:**
- `platforms/apply/data/itptitsa-state.json` — обработанные сообщения, отправленные DM
- `platforms/apply/data/itptitsa-share-state.json` — запощенные контакты (чтобы не дублировать)

---

### 8. rvc.global — встроено в `platforms/apply/`

**Что делает:** Читает список matched-вакансий через JWT API (`https://api.rvc.global`), извлекает apply-ссылки из описаний, роутит на career-адаптеры, сохраняет state чтобы не дублировать.

**Запуск:**
```bash
cd platforms/apply
source credentials.env
node cli.js rvc-global-apply
```

**State:** `platforms/apply/data/rvc-global-state.json` — хранит ID уже обработанных вакансий по статусу `applied`/`fill_only`. Чтобы повторить отклик — удали нужную запись из этого файла.

**Токен:** JWT из `localStorage.getItem('principal')` на `app.rvc.global`. Срок — ~14 дней. При истечении (API вернёт 401) обнови `RVC_GLOBAL_TOKEN` в `credentials.env`.

---

## Профиль кандидата

`platforms/apply/profile.yaml` — единый источник правды для career-адаптеров:

```yaml
active_market: ru
role: Frontend Developer
location: Berlin
markets:
  - ru_remote
keywords:
  - react
  - typescript
  - frontend
  - next.js
contact:
  telegram: "@ilyayaya27"
  email: "ilyasilkin27@gmail.com"
  phone: "+79958890127"
market_assets:
  ru:
    cover_letter_path: /home/alice/Documents/apply-hub/letter.txt
    resume_path: /home/alice/Documents/apply-hub/resume_ru.pdf
    hh_resume_id: 7ddbda16ff109325f00039ed1f774437315866
```

---

## Запуск с нуля (новая машина)

### Зависимости

```bash
# Node.js v20+
node --version

# Python 3.11+
python3 --version

# Playwright браузеры
cd platforms/apply && npx playwright install chromium
cd platforms/rvc  && npx playwright install chromium

# Python venv для LinkedIn
python3 -m venv .venv
.venv/bin/pip install selenium

# Node зависимости
cd platforms/apply && npm install
cd platforms/rvc   && npm install
```

### Telegram-сессия (один раз)

```bash
cd platforms/telegram
node generate-session.js   # вводишь номер телефона + код
# сохраняет .telegram_session
```

### systemd сервисы

```bash
# Скопировать unit-файлы
cp platforms/rvc/deploy/systemd/job-hub-monitor.service ~/.config/systemd/user/
cp systemd/hh-worker.service ~/.config/systemd/user/
# linkedin-worker.service — устанавливается отдельно (путь к venv)

systemctl --user daemon-reload
systemctl --user enable --now job-hub-monitor.service
systemctl --user enable hh-worker.service    # запускается по таймеру
systemctl --user enable --now linkedin-worker.service
```

### Проверка

```bash
systemctl --user status job-hub-monitor.service
systemctl --user status linkedin-worker.service
systemctl --user status hh-worker.service

# Тесты
cd platforms/apply && npm test   # 73 теста
cd platforms/rvc   && npm test
```

---

## Для AI-агентов

### Добавить новую career-платформу

1. **`platforms/apply/adapters/platforms/hosts.js`** — добавь в `CAREER_PLATFORMS`:
```javascript
{ id: 'new_careers', pattern: /new\.company\.ru\/careers/i }
```

2. **`platforms/apply/adapters/platforms/specs.js`** — добавь в `PLATFORM_SPECS`:
```javascript
new_careers: {
  ...CORP_RU,          // базовые RU-селекторы
  formless: true,      // если нет <form> (SPA) — иначе убрать
  pageSettleMs: 6000,  // ждать рендера SPA
  allowAutoSubmit: false, // включить после headed-проверки
},
```

3. **Smoke-тест без сабмита:**
```bash
cd platforms/apply
PLAYWRIGHT_ENABLED=1 FORM_SUBMIT=0 node cli.js career-smoke 'https://new.company.ru/careers/vacancy/123'
```

4. Если поля корректно заполнились → `allowAutoSubmit: true` → повторить с `FORM_SUBMIT=1`.

### Обновить rvc.global токен

Токен живёт ~14 дней. Когда API возвращает 401:

1. Открыть `https://app.rvc.global` в браузере, войти через Telegram
2. DevTools → Application → LocalStorage → ключ `principal` → скопировать значение поля `token`
3. Вставить в `platforms/apply/credentials.env`:
   ```
   RVC_GLOBAL_TOKEN=eyJhbGci...новый токен
   ```

### Добавить Telegram-канал для мониторинга

Отредактировать `platforms/rvc/sources.yaml`:
```yaml
- id: new_channel
  type: telegram_channel
  preview: new_channel   # @username без @
  market: ru
  priority: 2
  automation_tier: ingest_auto
  enabled: true
```

### Структура данных

```
platforms/apply/data/
├── applications.db         # SQLite: все отклики (дата, статус, URL)
├── rvc-global-state.json   # applied/fill_only по ID вакансий rvc.global
└── harvest-latest.json     # последний цикл Telegram-скана

platforms/rvc/data/
└── job-hub.db              # SQLite: вакансии из TG-каналов, scoring, статусы
```

---

## Текущий статус (2 июля 2026)

| Платформа | Сервис | Расписание | Статус |
|---|---|---|---|
| HH.ru | `hh-worker.timer` | каждые 4ч | ✅ работает |
| LinkedIn | `linkedin-worker.service` | непрерывно | ✅ работает |
| Telegram-каналы | `job-hub-monitor.service` | непрерывно | ✅ работает |
| rvc.global | `rvc-global-worker.timer` | каждые 6ч | ✅ работает |
| **GetMatch** | `getmatch-worker.timer` | каждые 6ч | ✅ работает (сессия: login-once) |
| **HN Hiring** | `hn-hiring-worker.timer` | ежедневно 10:00 | ✅ работает (26 откликов 1 июля) |
| **IT-Птица DM** | `itptitsa-worker.timer` | ежедневно 11:00 | ✅ работает (5 DM/день, реакции 👍) |
| **IT-Птица Share** | `itptitsa-share.timer` | ежедневно 12:00 | ✅ работает (2й аккаунт → топик) |
| Wellfound | `cli.js wellfound-apply` | вручную | ⚠️ DataDome (применять руками) |
| career-сайты | `cli.js career-smoke` | по запросу | ✅ RWB, Beeline, VK, Sber, Ozon, Облако.ру |

### Воронка за 1 июля 2026

| Источник | Найдено | Отправлено |
|---|---|---|
| HN Who Is Hiring | 45+ frontend+remote | **23** |
| GetMatch | 9 вакансий | **2** |
| rvc.global | ~40 вакансий | 1 (fill_only) |

**Итого: 26 откликов за день.** Лучший канал — прямые email основателям через HN.
