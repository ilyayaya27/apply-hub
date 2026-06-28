from hh_applicant_tool.screening_prompt import (
    build_reply_ai_query,
    ensure_telegram_footer,
)


def test_reply_flow_appends_telegram_after_ai():
    ai_text = "Здравствуйте! ЗП от 200 000 ₽, готов выйти сразу."
    final = ensure_telegram_footer(ai_text, "https://t.me/ilyayaya27")
    assert "t.me/ilyayaya27" in final
    assert "200 000" in final


def test_build_reply_ai_query_questionnaire_hint():
    query = build_reply_ai_query(
        vacancy_name="React",
        resume_context="Frontend developer",
        message_history=["Работодатель: Заполните анкету: ЗП, формат, тестовое"],
        screening_rules={"salary_min_rub": 200000},
        message_prompt="Кратко",
    )
    assert "ПРАВИЛА СКРИНИНГА" in query
    assert "__SKIP__" not in query
