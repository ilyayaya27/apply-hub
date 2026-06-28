# HH screening + Telegram funnel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автопилот ответов в чатах hh с переводом в Telegram (`@ilyayaya27`), авто-ответы на анкеты по SSOT-правилам, и команда `spawn-resume-variants` для ~4 перефразированных резюме.

**Architecture:** Расширяем существующий `reply-employers` (AI + config SSOT), без отдельного worker. Контакты и `screening_rules` — в `~/.config/hh-applicant-tool.json`. Pure-логика промптов вынесена в `screening_prompt.py` для тестов.

**Tech Stack:** Python 3.11+, pytest, существующий `ChatOpenAI`, hh API (`/negotiations`, `/resumes`, `/resume_profile`).

**Design spec:** `docs/superpowers/specs/2026-06-28-hh-screening-telegram-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/hh_applicant_tool/screening_prompt.py` | **Create** — сборка system/message prompt + footer TG из config |
| `src/hh_applicant_tool/operations/reply_employers.py` | **Modify** — использовать screening_prompt, убрать `__SKIP__`, append footer |
| `src/hh_applicant_tool/operations/spawn_resume_variants.py` | **Create** — clone + AI rephrase + publish |
| `src/hh_applicant_tool/main.py` | **Modify** — register `spawn-resume-variants` |
| `reply-employers.sh` | **Modify** — `--use-ai`, без хардкода REPLY |
| `tests/test_screening_prompt.py` | **Create** — unit tests |
| `tests/test_reply_employers_prompt.py` | **Create** — integration-style test AI query shape (mock) |
| `tests/test_spawn_resume_variants.py` | **Create** — pure rephrase payload tests |
| `letter.txt`, `platforms/apply/profile.yaml`, … | **Modify** — контакты TG/GitHub |
| `GUIDE.md`, `.claude/skills/hh-clicker/SKILL.md` | **Modify** — документация |

---

### Task 1: SSOT helpers — `screening_prompt.py`

**Files:**
- Create: `src/hh_applicant_tool/screening_prompt.py`
- Test: `tests/test_screening_prompt.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_screening_prompt.py
from hh_applicant_tool.screening_prompt import (
    build_screening_rules_block,
    build_message_prompt,
    ensure_telegram_footer,
    default_contacts,
)

def test_build_screening_rules_block_includes_salary():
    cfg = {"salary_min_rub": 200000, "work_format": "удалёнка"}
    block = build_screening_rules_block(cfg)
    assert "200000" in block
    assert "удалёнка" in block

def test_ensure_telegram_footer_appends_url():
    text = "Здравствуйте!"
    out = ensure_telegram_footer(text, "https://t.me/ilyayaya27")
    assert "t.me/ilyayaya27" in out
    assert out.startswith("Здравствуйте!")

def test_default_contacts():
    c = default_contacts()
    assert c["telegram_username"] == "ilyayaya27"
    assert "github.com/ilyayaya27" in c["github_url"]
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `cd /home/alice/Documents/apply-hub && .venv/bin/pytest tests/test_screening_prompt.py -v`

- [ ] **Step 3: Implement minimal module**

```python
# screening_prompt.py — build_screening_rules_block, build_message_prompt,
# ensure_telegram_footer, load from tool.config with defaults
DEFAULT_CONTACTS = {
    "telegram_username": "ilyayaya27",
    "telegram_url": "https://t.me/ilyayaya27",
    "github_url": "https://github.com/ilyayaya27",
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit** `feat(hh): screening prompt helpers with SSOT defaults`

---

### Task 2: Config schema documentation + example

**Files:**
- Modify: `GUIDE.md` (секция config)
- Optional: `config.example.json` if repo already has pattern — else only GUIDE

- [ ] **Step 1:** Document keys `contacts`, `screening_rules`, `reply_chat` in GUIDE with example JSON (TG `@ilyayaya27`, GitHub `ilyayaya27`).

- [ ] **Step 2:** Note: user must merge into `~/.config/hh-applicant-tool.json` locally (не коммитить secrets).

- [ ] **Step 3: Commit** `docs: hh screening_rules and contacts in GUIDE`

---

### Task 3: `reply_employers.py` — анкеты + TG footer

**Files:**
- Modify: `src/hh_applicant_tool/operations/reply_employers.py:289-317`
- Test: `tests/test_reply_employers_prompt.py`

- [ ] **Step 1: Write test** — `build_ai_query()` or extracted function includes screening block and forbids `__SKIP__`:

```python
def test_ai_query_includes_screening_rules_not_skip():
    query = build_reply_ai_query(
        vacancy_name="Frontend",
        resume_context="Должность: React dev",
        message_history=["Работодатель: Укажите ЗП и график"],
        screening_rules={"salary_min_rub": 200000},
        message_prompt="Ответь кратко",
    )
    assert "__SKIP__" not in query
    assert "200000" in query
    assert "анкет" in query.lower() or "вопрос" in query.lower()
```

- [ ] **Step 2: Run test — FAIL**

- [ ] **Step 3: Refactor** — extract `build_reply_ai_query` to `screening_prompt.py` or module-level in reply_employers; replace `__SKIP__` instruction with:

  - «На анкеты отвечай по блоку ПРАВИЛА СКРИНИНГА; не выдумывай; если факта нет — нейтрально + предложи Telegram»

- [ ] **Step 4:** After AI `complete()`, call `ensure_telegram_footer(send_message, telegram_url from config)`.

- [ ] **Step 5:** In `run()`, if `args.use_ai`, merge config `reply_chat.system_prompt` / `message_prompt` when CLI defaults unchanged.

- [ ] **Step 6: Run tests — PASS**

- [ ] **Step 7: Commit** `feat(hh): AI reply with screening rules and TG footer`

---

### Task 4: `reply-employers.sh` — включить AI

**Files:**
- Modify: `reply-employers.sh`

- [ ] **Step 1:** Remove `REPLY=` hardcode and `--no-ai --reply-message`.

- [ ] **Step 2:** New invocation:

```bash
exec $PY -m hh_applicant_tool reply-employers --use-ai "$@"
```

- [ ] **Step 3:** Manual dry-run:

```bash
./reply-employers.sh --dry-run
```

- [ ] **Step 4: Commit** `chore(hh): reply-employers uses AI from config`

---

### Task 5: Contact SSOT sweep

**Files:**
- Modify: `letter.txt`, `platforms/apply/profile.yaml`, `platforms/linkedin/additionalQuestions.yaml`, `platforms/telegram/src/config/channels.json` (if tracked)

- [ ] **Step 1:** `rg ilyasilkin27` — replace with `ilyayaya27` / `https://github.com/ilyayaya27` / `https://t.me/ilyayaya27`.

- [ ] **Step 2:** Verify no stale references: `rg ilyasilkin27` → empty.

- [ ] **Step 3: Commit** `chore: update Telegram and GitHub contacts to ilyayaya27`

---

### Task 6: `spawn-resume-variants` — pure rephrase logic

**Files:**
- Create: `src/hh_applicant_tool/resume_variant.py` (pure: `apply_variant_texts(full_resume, variant_spec) -> dict`)
- Test: `tests/test_spawn_resume_variants.py`

- [ ] **Step 1: Test** — given fixture resume dict, variant changes only `title`, `skills`, experience descriptions; preserves company names and dates.

- [ ] **Step 2: Implement** `apply_variant_texts` (no API).

- [ ] **Step 3: Commit** `feat(hh): resume variant text merge helper`

---

### Task 7: `spawn-resume-variants` operation

**Files:**
- Create: `src/hh_applicant_tool/operations/spawn_resume_variants.py`
- Modify: `src/hh_applicant_tool/main.py`

- [ ] **Step 1:** CLI: `--count`, `--resume-id`, `--dry-run`, `--base-title-hint` (optional).

- [ ] **Step 2:** Flow: list published → pick base → for i in range(count): `clone-resume` logic (reuse from `clone_resume.py` or import) → GET `/resumes/{id}` → AI JSON variant `{title, skills, experience: [{index, description}]}` → merge via `apply_variant_texts` → POST update (same as create_resume profile path) → publish.

- [ ] **Step 3:** `--dry-run`: print planned titles only, no POST.

- [ ] **Step 4:** Register alias `spawn-resume-variants` in main.

- [ ] **Step 5:** Manual: `.venv/bin/python -m hh_applicant_tool spawn-resume-variants --count 1 --dry-run`

- [ ] **Step 6: Commit** `feat(hh): spawn-resume-variants command`

---

### Task 8: Integration test boundary (prompt contract)

**Files:**
- Create: `tests/test_reply_employers_integration.py`

Per ptitsa-integration-testing: test must cross boundary — e.g. mock `ChatOpenAI.complete` and assert **POST** to `/negotiations/{id}/messages` would receive text containing `t.me/ilyayaya27` when employer message last.

- [ ] **Step 1:** Use minimal fake api_client + negotiation fixture from existing test patterns (see `tests/test_start.py`).

- [ ] **Step 2: Commit** `test(hh): reply-employers sends TG footer on employer message`

---

### Task 9: Docs + hh-clicker skill

**Files:**
- Modify: `GUIDE.md`, `.claude/skills/hh-clicker/SKILL.md`, `CHANGELOG.md`

- [ ] **Step 1:** Document `spawn-resume-variants`, config keys, dry-run checklist.

- [ ] **Step 2:** hh-clicker: «перед prod — reply-employers --dry-run --use-ai».

- [ ] **Step 3: Commit** `docs: hh screening autopilot and resume variants`

---

## Pre-production checklist

- [ ] User filled `screening_rules` in local config (salary, format, test task, notice).
- [ ] `./reply-employers.sh --dry-run` — ответы содержат `https://t.me/ilyayaya27`, нет `__SKIP__`.
- [ ] `spawn-resume-variants --dry-run` — 3–4 варианта title выглядят разумно.
- [ ] `pytest` green.
- [ ] `hh-worker` перезапущен после снятия `--dry-run` (только когда пользователь готов).

---

## User action required

Добавь в `~/.config/hh-applicant-tool.json` (пример):

```json
{
  "contacts": {
    "telegram_username": "ilyayaya27",
    "telegram_url": "https://t.me/ilyayaya27",
    "github_url": "https://github.com/ilyayaya27"
  },
  "screening_rules": {
    "salary_min_rub": 0,
    "salary_comment": "",
    "work_format": "",
    "test_task": "",
    "notice_days": 14
  }
}
```

Заполни `salary_min_rub`, `work_format`, `test_task` под себя — без этого AI будет слишком нейтральным на анкетах.
