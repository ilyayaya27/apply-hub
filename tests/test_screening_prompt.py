from hh_applicant_tool.screening_prompt import (
    DEFAULT_MESSAGE_PROMPT,
    DEFAULT_SYSTEM_PROMPT,
    build_reply_ai_query,
    build_screening_rules_block,
    default_contacts,
    default_screening_rules,
    ensure_telegram_footer,
    resolve_reply_chat_prompts,
    screening_rules_from_config,
)

def test_build_screening_rules_block_includes_salary_and_notice():
    block = build_screening_rules_block(default_screening_rules())
    assert "200000" in block
    assert "удалёнка" in block
    assert "готов выйти сразу" in block
    assert "тестовое" in block.lower()


def test_ensure_telegram_footer_appends_url():
    text = "Здравствуйте!"
    out = ensure_telegram_footer(text, "https://t.me/ilyayaya27")
    assert "t.me/ilyayaya27" in out
    assert out.startswith("Здравствуйте!")


def test_ensure_telegram_footer_skips_duplicate():
    text = "Пишите в https://t.me/ilyayaya27"
    out = ensure_telegram_footer(text, "https://t.me/ilyayaya27")
    assert out.count("t.me/ilyayaya27") == 1


def test_default_contacts():
    c = default_contacts()
    assert c["telegram_username"] == "ilyayaya27"
    assert "github.com/ilyayaya27" in c["github_url"]


def test_screening_rules_from_config_merges():
    rules = screening_rules_from_config({"screening_rules": {"salary_min_rub": 250000}})
    assert rules["salary_min_rub"] == 250000
    assert rules["notice_days"] == 0


def test_resolve_reply_chat_prompts_from_config():
    cfg = {
        "reply_chat": {
            "system_prompt": "Custom system",
            "message_prompt": "Custom message",
        }
    }
    system, message = resolve_reply_chat_prompts(
        cfg, DEFAULT_SYSTEM_PROMPT, DEFAULT_MESSAGE_PROMPT
    )
    assert system == "Custom system"
    assert message == "Custom message"


def test_resolve_reply_chat_keeps_cli_overrides():
    cfg = {"reply_chat": {"system_prompt": "Custom system"}}
    system, message = resolve_reply_chat_prompts(
        cfg, "CLI system", DEFAULT_MESSAGE_PROMPT
    )
    assert system == "CLI system"


def test_ai_query_includes_screening_rules_not_skip():
    query = build_reply_ai_query(
        vacancy_name="Frontend",
        resume_context="Должность: React dev",
        message_history=["Работодатель: Укажите ЗП и график"],
        screening_rules={"salary_min_rub": 200000, "work_format": "удалёнка"},
        message_prompt="Ответь кратко",
    )
    assert "__SKIP__" not in query
    assert "200000" in query
    assert "анкет" in query.lower() or "вопрос" in query.lower()
