# Краткий гайд по запуску hh-applicant-tool

## 1. Требования

- Python 3.11 или новее
- Git

---

## 2. Установка

```bash
git clone https://github.com/s3rgeym/hh-applicant-tool
cd hh-applicant-tool

# Создаём локальное виртуальное окружение
python3 -m venv .venv

# Устанавливаем пакет со всеми зависимостями
.venv/bin/pip install -e .
```

После этого команда запускается так:

```bash
.venv/bin/python -m hh_applicant_tool <команда> [аргументы]
```

---

## 3. Авторизация

```bash
.venv/bin/python -m hh_applicant_tool auth
```

Введите email и код из письма/SMS. Токен сохранится автоматически в:

```
~/.config/hh-applicant-tool/config.json
```

---

## 4. Сопроводительное письмо

Отредактируйте файл `letter.txt` в корне проекта:

```
Добрый день!

Я фронтенд-разработчик на React и TypeScript.
...
```

Этот текст будет прикладываться к каждому отклику.

---

## 5. Рассылка откликов

```bash
.venv/bin/python -m hh_applicant_tool apply-vacancies \
  -L letter.txt \
  -f \
  --search 'ваш поисковый запрос' \
  --experience between1And3 \
  --excluded-filter 'junior|стажировк|intern|senior|lead'
```

### Ключевые параметры:

| Параметр                  | Описание                                                                        |
| ------------------------- | ------------------------------------------------------------------------------- |
| `-L letter.txt`           | Путь до файла с сопроводительным письмом                                        |
| `-f` / `--force-message`  | Всегда прикладывать письмо                                                      |
| `--search '...'`          | Поисковый запрос (язык HH: AND, OR, NOT)                                        |
| `--experience`            | Уровень опыта: `noExperience`, `between1And3`, `between3And6`, `moreThan6`      |
| `--area 1`                | Регион (1 = Москва, 2 = СПб; без параметра — все регионы)                       |
| `--excluded-filter '...'` | Regex-фильтр: пропускаем вакансии с такими словами в названии/описании          |
| `--dry-run`               | Пробный запуск без реальных откликов — полезно для проверки фильтров            |
| `--resume-id <id>`        | Откликаться только с конкретного резюме (по умолчанию — со всех опубликованных) |

### Пример для frontend middle по всем регионам:

```bash
.venv/bin/python -m hh_applicant_tool apply-vacancies \
  -L letter.txt \
  -f \
  --search '(frontend OR "frontend developer" OR react OR typescript OR next.js) NOT junior NOT intern NOT senior NOT lead NOT "team lead"' \
  --experience between1And3 \
  --excluded-filter 'junior|стажировк|intern|senior|lead|team\s*lead|bitrix|web3|crypto|blockchain|хакатон|конкурс'
```

> Лимит откликов на HH — **200 в сутки** на аккаунт. При достижении лимита утилита пишет `Достигли лимита на отклики` и продолжает обходить вакансии (сохраняет контакты), но не отправляет новые отклики.

---

## 6. Настройка AI (OpenRouter) — один раз

AI нужен для двух задач:
- генерация сопроводительного письма под каждую вакансию (`apply-vacancies --ai`);
- ответы работодателям в чатах (`reply-employers --ai`).

Обе используют одну секцию конфига — `openai_cover_letter`.

### 6.1. Получить бесплатный ключ OpenRouter

1. Зайдите на **[openrouter.ai](https://openrouter.ai)** и войдите (через Google или GitHub).
2. Откройте **[openrouter.ai/settings/keys](https://openrouter.ai/settings/keys)** → нажмите **Create Key** → скопируйте ключ вида `sk-or-v1-...`.
3. Ключ показывается **только один раз** — сразу сохраните его.

> ⚠️ Никогда не вставляйте ключ в публичные места: README, чаты, скриншоты, коммиты. Если случайно засветили — отзовите его на той же странице и создайте новый.

### 6.2. Прописать ключ и модель в конфиг

```bash
.venv/bin/python -m hh_applicant_tool config -s openai_cover_letter.base_url https://openrouter.ai/api/v1/chat/completions
.venv/bin/python -m hh_applicant_tool config -s openai_cover_letter.model qwen/qwen3-next-80b-a3b-instruct:free
.venv/bin/python -m hh_applicant_tool config -s openai_cover_letter.api_key sk-or-v1-ВАШ_КЛЮЧ
.venv/bin/python -m hh_applicant_tool config -s openai_cover_letter.temperature 0.5
```

Бесплатные модели OpenRouter на выбор (вписываются в `...model`):
- `qwen/qwen3-next-80b-a3b-instruct:free` — хорошо с русским и инструкциями (рекомендуется);
- `moonshotai/kimi-k2.6:free` — пишет живее;
- `z-ai/glm-4.5-air:free` — полегче, как запасной.

> Бесплатный тариф ограничен (порядка **50 запросов/день**). Для больших рассылок пополните баланс OpenRouter (~$10) или возьмите платную модель.

### 6.3. Использование

Сопроводительные письма под каждую вакансию (промпт лежит в `cover_letter_prompt.txt` в корне проекта):

```bash
.venv/bin/python -m hh_applicant_tool apply-vacancies --ai -f \
  --system-prompt "$(cat cover_letter_prompt.txt)" \
  --message-prompt "Данные вакансии и резюме — ниже. Напиши письмо строго по правилам из системного промпта." \
  --search 'ваш поисковый запрос'
```

Ответы работодателям по чатам:

```bash
.venv/bin/python -m hh_applicant_tool reply-employers --ai
```

`reply-employers` пройдёт по всем активным чатам и ответит там, где:

- последнее сообщение от работодателя, или
- ваш ответ ещё не прочитан.

---

## 7. Поднятие резюме

```bash
.venv/bin/python -m hh_applicant_tool update-resumes
```

Аналогично кнопке «Обновить дату» — поднимает резюме в поиске.

---

## 8. Просмотр резюме и их ID

```bash
.venv/bin/python -m hh_applicant_tool list-resumes
```

---

## 9. Типичный ежедневный сценарий

```bash
cd /home/alice/Documents/hh-applicant-tool

# 1. Обновить токен (на всякий случай)
.venv/bin/python -m hh_applicant_tool refresh-token

# 2. Поднять резюме
.venv/bin/python -m hh_applicant_tool update-resumes

# 3. Разослать отклики
.venv/bin/python -m hh_applicant_tool apply-vacancies \
  -L letter.txt -f \
  --search '(frontend OR react OR typescript OR next.js) NOT junior NOT senior NOT lead' \
  --experience between1And3 \
  --excluded-filter 'junior|стажировк|intern|senior|lead|bitrix|web3'

# 4. Ответить работодателям через AI
.venv/bin/python -m hh_applicant_tool reply-employers --ai
```

---

## 10. Конфиг — где хранится и как посмотреть

```bash
# Показать весь конфиг
.venv/bin/python -m hh_applicant_tool config

# Показать путь до файла конфига
.venv/bin/python -m hh_applicant_tool config -p

# Открыть конфиг в редакторе
.venv/bin/python -m hh_applicant_tool config -e

# Установить отдельное значение
.venv/bin/python -m hh_applicant_tool config -s proxy_url socks5h://127.0.0.1:1080

# Удалить значение
.venv/bin/python -m hh_applicant_tool config -u proxy_url
```

Конфиг по умолчанию: `~/.config/hh-applicant-tool/config.json`

---

## 11. Несколько аккаунтов (профили)

```bash
# Авторизация второго аккаунта
.venv/bin/python -m hh_applicant_tool --profile-id second auth

# Запуск откликов со второго аккаунта
.venv/bin/python -m hh_applicant_tool --profile-id second apply-vacancies -L letter.txt -f ...
```

Данные каждого профиля хранятся отдельно в `~/.config/hh-applicant-tool/second/`.

---

## 12. Полезные команды

```bash
# Кто залогинен
.venv/bin/python -m hh_applicant_tool whoami

# Посмотреть лог в реальном времени
.venv/bin/python -m hh_applicant_tool log -f

# Экспорт всех контактов работодателей в CSV
.venv/bin/python -m hh_applicant_tool query 'select * from vacancy_contacts' --csv -o contacts.csv

# Отменить все отклики (не рекомендуется без необходимости)
.venv/bin/python -m hh_applicant_tool clear-negotiations
```

---

## 13. Человекоподобные задержки между откликами

Чтобы рассылка не выглядела как бот (мгновенные отклики подряд), добавлены флаги случайной паузы **между откликами**:

```bash
.venv/bin/python -m hh_applicant_tool apply-vacancies -L letter.txt -f \
  --search '...' \
  --apply-delay-min 40 --apply-delay-max 180
```

- После каждого отправленного отклика — случайная пауза в диапазоне `[min, max]` секунд (каждый раз разная).
- В логе видно: `⏳ Пауза 73 сек перед следующим откликом`.
- По умолчанию `0` — без паузы (старое поведение).

**Как настроить под «живой» поиск:**
- Не отправляй 200 откликов залпом. Лучше `--apply-delay-min 40 --apply-delay-max 180` + несколько заходов в день по крону.
- Дефолтный `crontab` уже рассылает только с 8:00 до 21:00 — это тоже выглядит естественно.
- Пауза **случайная** (а не ровно 60с) — так менее палевно.

> Как это работает под капотом: утилита шлёт отклики через **API hh** (не «кликает» по страницам). Но при включённых `--excluded-filter` / `--ai-filter` / AI-письме она **догружает полное описание каждой вакансии** — то есть фактически «читает» её перед откликом.

---

## 14. Фильтр нерелевантных вакансий и ревью чёрного списка

Поиск (`--search`) фильтрует **только по названию**. Чтобы отсеивать чужие стеки, указанные **в описании** (которых в названии не видно), используется `--excluded-filter` — regex по названию **и полному описанию**:

```bash
.venv/bin/python -m hh_applicant_tool apply-vacancies -L letter.txt -f \
  --search '(NAME:(frontend OR react OR typescript OR "next.js")) AND NOT NAME:(fullstack OR backend OR QA)' \
  --excluded-filter 'golang|\bgo\b|laravel|symfony|\bphp\b|wordpress|drupal|1с|bitrix|битрикс'
```

**🔑 Принцип фильтра:** исключай только **однозначные** стек-слова (`golang`, `php`, `laravel`…). НЕ исключай `vue`/`angular` — есть вакансии «React **или** Vue **или** Angular» (берут на любой стек, тебе подходят), и слово-фильтр их ошибочно выкинет. Различать «Vue-only» от «Vue/React» умеет только `--ai-filter heavy` (читает описание + твоё резюме по смыслу).

Полезные приёмы regex: `\bgo\b` ловит «Go», но не «Good»; `\bjava\b` не заденет «javascript»; регистр не важен.

### Цикл «ревью → тюнинг»

Все отклонённые фильтром вакансии сохраняются в базу — **с указанием сработавшего слова**. Периодически проверяй, не выкинуло ли хорошее:

```bash
.venv/bin/python -m hh_applicant_tool query \
  "SELECT name, employer_name, matched FROM skipped_vacancies WHERE reason='excluded_filter' ORDER BY created_at DESC LIMIT 30"
```

Пример вывода — сразу видно ошибку фильтра:
```
«Angular» ← Frontend-разработчик (Angular, React)   ← подходит! правь фильтр
«vue»     ← Frontend разработчик (Краснодар)         ← ок, это Vue-вакансия
```

Увидел ложное срабатывание → убери лишнее слово из `--excluded-filter`. Со временем фильтр сходится под тебя.

> Проверять фильтр без единого отклика можно через `--dry-run` — покажет, кого выкинуло.
