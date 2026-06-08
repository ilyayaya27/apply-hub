#!/usr/bin/env python3
"""Ручной анализ отказов и подсказки по докрутке резюме (keyword-gap).

Что делает:
  1. Берёт отказы (negotiations со статусом discard) по основному аккаунту.
  2. Отсеивает вакансии не твоего стека (Angular/Vue/QA/PHP/Go и т.п.) — иначе
     анализ зашумлён чужими технологиями.
  3. Считает время до отказа: быстрый отказ (минуты) = сработал АВТОФИЛЬТР/ATS,
     медленный (часы/дни) = смотрел человек.
  4. По релевантным отказам тянет требуемые навыки (key_skills) и показывает,
     каких из них НЕТ в твоём резюме — это кандидаты на добавление.

Запуск (из каталога проекта, в активном venv):
    python analyze_rejections.py
    python analyze_rejections.py --profile-id student1   # для другого профиля

ВАЖНО: добавляй в резюме только то, что реально знаешь. Если в подсказках
вылезли Angular/Vue/Backend — это шум от чужих вакансий, НЕ добавляй их.
"""
from __future__ import annotations

import re
import sys
from collections import Counter

from hh_applicant_tool.main import HHApplicantTool
from hh_applicant_tool.utils.date import parse_api_datetime

# Технологии/роли НЕ твоего стека — вакансии с ними не анализируем
MISMATCH = re.compile(
    r"angular|vue|svelte|\bqa\b|тестировщ|тестирован|automation|python|php|"
    r"golang|\bgo\b|c#|\bjava\b|fullstack|full.?stack|tech lead|тимлид|"
    r"менеджер|project manager|тренер|преподават|backend|cocos|razor|elma|"
    r"backbone|c\+\+|react native",
    re.I,
)


def main() -> None:
    profile = None
    if "--profile-id" in sys.argv:
        profile = sys.argv[sys.argv.index("--profile-id") + 1]

    tool = HHApplicantTool()
    for attr in (
        "config_dir", "profile_id", "verbosity", "api_delay",
        "user_agent", "proxy_url", "openai_proxy_url",
    ):
        setattr(tool, attr, None)
    tool.profile_id = profile

    api = tool.api_client

    # 1. Что уже есть в резюме (навыки + «о себе» + должность)
    # ВАЖНО: /resumes/mine отдаёт урезанный объект без skill_set/skills,
    # поэтому тянем ПОЛНОЕ резюме по id.
    resume_id = tool.get_resumes()[0]["id"]
    resume = api.get(f"/resumes/{resume_id}")
    have = (
        " ".join(resume.get("skill_set") or [])
        + " " + (resume.get("skills") or "")
        + " " + (resume.get("title") or "")
    ).lower()

    # 2. Все отказы
    rejections = []
    for page in range(0, 10):
        r = api.get(
            "/negotiations", per_page=100, page=page,
            status="discard", order_by="updated_at",
        )
        items = r.get("items", [])
        if not items:
            break
        rejections += items
        if page + 1 >= r.get("pages", 0):
            break

    # 3. Только релевантные + скорость отказа
    buckets = Counter()
    relevant = []
    for n in rejections:
        if MISMATCH.search(n["vacancy"].get("name", "")):
            continue
        applied = parse_api_datetime(n["created_at"])
        rejected = parse_api_datetime(n["updated_at"])
        minutes = (rejected - applied).total_seconds() / 60
        bucket = (
            "<16 мин (автофильтр)" if minutes < 16
            else "<60 мин" if minutes < 60
            else "<24 ч" if minutes < 1440
            else ">24 ч (человек)"
        )
        buckets[bucket] += 1
        relevant.append(n)

    print(f"Релевантных отказов (по твоему стеку): {len(relevant)}\n")
    print("Скорость отказа (быстрый = фильтр, медленный = человек):")
    for b in ("<16 мин (автофильтр)", "<60 мин", "<24 ч", ">24 ч (человек)"):
        print(f"  {b}: {buckets.get(b, 0)}")

    # 4. Keyword-gap: требуемое, но отсутствующее в резюме
    missing = Counter()
    for n in relevant:
        try:
            full = api.get(f"/vacancies/{n['vacancy']['id']}")
        except Exception:
            continue
        for skill in full.get("key_skills") or []:
            name = skill.get("name", "")
            if not name:
                continue
            # пропускаем чужой стек и то, что уже есть в резюме
            if MISMATCH.search(name) or name.lower() in have:
                continue
            missing[name] += 1

    print("\nЧего требуют отказные вакансии, но НЕТ в резюме (кандидаты):")
    if not missing:
        print("  — пусто. Резюме хорошо покрывает требования.")
    for name, count in missing.most_common(20):
        print(f"  {count}×  {name}")
    print(
        "\n⚠️ Добавляй только то, что реально знаешь. Чужой стек игнорируй."
    )


if __name__ == "__main__":
    main()
