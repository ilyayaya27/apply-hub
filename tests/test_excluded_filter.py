"""Регресс-тест на EXCLUDED_FILTER из apply-vacancies.sh.

Фильтр уже дважды пропускал мимо целые классы нерелевантных вакансий
(backend/QA/mobile 14.07, затем 1С/Delphi/Bitrix/DBA/Ruby on Rails 21.07).
Тест держит явный список "должно резаться" / "не должно резаться", чтобы
следующая правка регекса не тихо сломала одну из сторон.
"""

import re
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "apply-vacancies.sh"


def _load_excluded_filter() -> re.Pattern:
    text = SCRIPT.read_text()
    m = re.search(r"^EXCLUDED_FILTER='(.*)'$", text, re.MULTILINE)
    assert m, "EXCLUDED_FILTER не найден в apply-vacancies.sh"
    return re.compile(m.group(1), re.IGNORECASE)


EXCLUDED_TITLES = [
    "Программист С++ (UI)",  # Cyrillic С, не Latin C
    "Программист C# + SQL",
    "Senior PHP разработчик",
    "Программист 1С",
    "Разработчик PHP/Битрикс 24",
    "TeamLead/Ведущий Разработчик Delphi",
    "Программист/Разработчик баз данных PL/SQL",
    "Senior IOS-разработчик в Маркетплейс",
    "Администратор баз данных PostgreSQL / PostgreSQL DBA",
    "Ruby on Rails разработчик",
    "Бизнес-аналитик в HR Tech",
    "Разработчик на ИТ-митап",
    "Node.js Developer",
    "Педагог по программированию для детей / Преподаватель Junior Code",
]

KEPT_TITLES = [
    "Frontend-разработчик",
    "Fullstack Developer (React + NestJS)",
    "Frontend developer (УВД)",
    "Фронтенд AI-агента",
    "Senior / Tech Lead React Developer (Платформа внутренних облачных сервисов)",
    "Frontend разработчик (Middle+)",
    "Frontend/React разработчик",
]


def test_excluded_filter_catches_known_mismatches():
    pat = _load_excluded_filter()
    for title in EXCLUDED_TITLES:
        assert pat.search(title), f"должно было исключиться: {title}"


def test_excluded_filter_keeps_relevant_titles():
    pat = _load_excluded_filter()
    for title in KEPT_TITLES:
        assert not pat.search(title), f"не должно было исключиться: {title}"
