from __future__ import annotations

from typing import Any

DEFAULT_CONTACTS: dict[str, str] = {
    "telegram_username": "ilyayaya27",
    "telegram_url": "https://t.me/ilyayaya27",
    "github_url": "https://github.com/ilyayaya27",
}

DEFAULT_SCREENING_RULES: dict[str, Any] = {
    "salary_min_rub": 200_000,
    "salary_comment": "от 200 000 ₽, обсуждаемо при интересном проекте",
    "work_format": "удалёнка, гибрид, офис — любой формат подходит",
    "test_task": "короткое тестовое — да; многочасовое бесплатное — нет",
    "notice_days": 0,
    "notice_comment": "готов выйти сразу",
}

DEFAULT_SYSTEM_PROMPT = (
    "Ты — соискатель на HeadHunter. Отвечай вежливо и кратко."
)
DEFAULT_MESSAGE_PROMPT = (
    "Напиши короткий ответ работодателю на основе истории переписки."
)

QUESTIONNAIRE_INSTRUCTION = (
    "Если работодатель прислал анкету (несколько вопросов: зарплата, "
    "график, занятость, тестовое, срок выхода) — ответь на каждый пункт "
    "по блоку ПРАВИЛА СКРИНИНГА. Не выдумывай факты, которых нет в резюме "
    "и правилах. Если факта нет — ответь нейтрально и предложи продолжить "
    "в Telegram."
)


def default_contacts() -> dict[str, str]:
    return dict(DEFAULT_CONTACTS)


def default_screening_rules() -> dict[str, Any]:
    return dict(DEFAULT_SCREENING_RULES)


def contacts_from_config(config: dict[str, Any] | None) -> dict[str, str]:
    merged = default_contacts()
    if config and isinstance(config.get("contacts"), dict):
        merged.update(config["contacts"])
    return merged


def screening_rules_from_config(
    config: dict[str, Any] | None,
) -> dict[str, Any]:
    merged = default_screening_rules()
    if config and isinstance(config.get("screening_rules"), dict):
        merged.update(config["screening_rules"])
    return merged


def build_screening_rules_block(rules: dict[str, Any]) -> str:
    lines = ["=== ПРАВИЛА СКРИНИНГА (ответы на типовые вопросы) ==="]
    salary = rules.get("salary_min_rub")
    if salary is not None:
        comment = rules.get("salary_comment") or ""
        line = f"- Зарплата: от {salary} ₽"
        if comment:
            line = f"{line}. {comment}"
        lines.append(line)
    if work_format := rules.get("work_format"):
        lines.append(f"- Формат работы: {work_format}")
    if test_task := rules.get("test_task"):
        lines.append(f"- Тестовое: {test_task}")
    notice_comment = rules.get("notice_comment")
    if notice_comment:
        lines.append(f"- Срок выхода: {notice_comment}")
    elif (notice_days := rules.get("notice_days")) is not None:
        lines.append(f"- Срок выхода: через {notice_days} дн.")
    return "\n".join(lines)


def ensure_telegram_footer(
    text: str,
    telegram_url: str,
    telegram_username: str | None = None,
) -> str:
    body = (text or "").strip()
    if not body:
        return body
    needles: list[str] = []
    if telegram_url:
        needles.append(
            telegram_url.lower().replace("https://", "").replace("http://", "")
        )
    if telegram_username:
        user = telegram_username.lstrip("@").lower()
        needles.extend((f"t.me/{user}", f"@{user}"))
    lower = body.lower()
    if any(n in lower for n in needles if n):
        return body
    if telegram_url:
        return f"{body}\n\nTelegram: {telegram_url}"
    if telegram_username:
        user = telegram_username.lstrip("@")
        return f"{body}\n\nTelegram: @{user}"
    return body


def resolve_reply_chat_prompts(
    config: dict[str, Any] | None,
    cli_system_prompt: str,
    cli_message_prompt: str,
) -> tuple[str, str]:
    reply_chat = (config or {}).get("reply_chat") or {}
    system = (
        reply_chat["system_prompt"]
        if cli_system_prompt == DEFAULT_SYSTEM_PROMPT
        and reply_chat.get("system_prompt")
        else cli_system_prompt
    )
    message = (
        reply_chat["message_prompt"]
        if cli_message_prompt == DEFAULT_MESSAGE_PROMPT
        and reply_chat.get("message_prompt")
        else cli_message_prompt
    )
    return system, message


def build_reply_ai_query(
    *,
    vacancy_name: str,
    resume_context: str,
    message_history: list[str],
    screening_rules: dict[str, Any],
    message_prompt: str,
) -> str:
    screening_block = build_screening_rules_block(screening_rules)
    history = "\n".join(message_history[-10:])
    return (
        f"Вакансия: {vacancy_name}\n\n"
        f"=== РЕЗЮМЕ (факты обо мне) ===\n"
        f"{resume_context}\n\n"
        f"{screening_block}\n\n"
        f"=== ИСТОРИЯ ПЕРЕПИСКИ ===\n"
        f"{history}\n\n"
        f"Инструкция: {message_prompt} "
        "Отвечай на вопросы работодателя, опираясь на факты из резюме "
        "и правила скрининга выше. Если нужного факта нет — не выдумывай. "
        "Не придумывай имя собеседника. "
        f"{QUESTIONNAIRE_INSTRUCTION}"
    )
