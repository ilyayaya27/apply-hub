from __future__ import annotations

import argparse
import json
import logging
import re
from typing import TYPE_CHECKING, Any

from ..ai.base import AIError
from ..api import ApiError, datatypes
from ..main import BaseNamespace, BaseOperation
from ..resume_profile import (
    clone_resume_profile,
    fetch_resume_profile,
    publish_resume,
    update_resume_profile,
)
from ..resume_variant import apply_variant_texts, build_variant_update_body
from ..utils.string import shorten

if TYPE_CHECKING:
    from ..main import HHApplicantTool


logger = logging.getLogger(__package__)

VARIANT_SYSTEM_PROMPT = (
    "Ты помогаешь соискателю создать вариант резюме для A/B-теста на hh.ru. "
    "Сохраняй факты (компании, даты, стек), меняй формулировки title/skills/"
    "описаний опыта. Ответ — только JSON без markdown."
)


class Namespace(BaseNamespace):
    resume_id: str | None
    count: int
    dry_run: bool
    base_title_hint: str | None


class Operation(BaseOperation):
    """Клонировать резюме и создать перефразированные варианты."""

    __aliases__ = ["spawn-variants"]

    def setup_parser(self, parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "--resume-id",
            help="Базовое опубликованное резюме (по умолчанию — первое published)",
        )
        parser.add_argument(
            "--count",
            type=int,
            default=3,
            help="Сколько вариантов создать (по умолчанию 3)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Не клонировать и не публиковать — только показать план/JSON",
        )
        parser.add_argument(
            "--base-title-hint",
            help="Подсказка для AI (например «React frontend»)",
        )

    def run(self, tool: HHApplicantTool, args: Namespace) -> None:
        resumes: list[datatypes.Resume] = tool.get_resumes()
        published = [
            r for r in resumes if r.get("status", {}).get("id") == "published"
        ]
        if not published:
            logger.error("Нет опубликованных резюме")
            return

        base = next(
            (r for r in published if r["id"] == args.resume_id),
            published[0],
        )
        if args.resume_id and base["id"] != args.resume_id:
            logger.error("Резюме %s не найдено среди published", args.resume_id)
            return

        ai = tool.get_cover_letter_ai(VARIANT_SYSTEM_PROMPT)
        profile = fetch_resume_profile(tool.api_client, base["id"])
        resume = profile.get("resume") or {}
        base_title = resume.get("title") or base.get("title") or ""

        for index in range(1, args.count + 1):
            variant_spec = self._generate_variant(
                ai,
                profile,
                base_title,
                index,
                args.base_title_hint,
            )
            merged = apply_variant_texts(profile, variant_spec)
            title = (merged.get("resume") or {}).get("title", "?")

            if args.dry_run:
                print(f"\n--- dry-run variant {index}/{args.count} ---")
                print("title:", title)
                print(json.dumps(variant_spec, ensure_ascii=False, indent=2))
                continue

            try:
                new_id = clone_resume_profile(tool.api_client, base["id"])
                draft_profile = fetch_resume_profile(tool.api_client, new_id)
                update_body = build_variant_update_body(
                    draft_profile, variant_spec
                )
                update_resume_profile(tool.api_client, new_id, update_body)
                publish_resume(tool.api_client, new_id)
                print(
                    f"✅ Вариант {index}:",
                    f"https://hh.ru/resume/{new_id}",
                    "-",
                    shorten(title),
                )
            except ApiError as ex:
                detail = getattr(ex, "data", None) or ex
                logger.error("Ошибка варианта %s: %s", index, detail)

    def _generate_variant(
        self,
        ai: Any,
        profile: dict[str, Any],
        base_title: str,
        index: int,
        title_hint: str | None,
    ) -> dict[str, Any]:
        resume = profile.get("resume") or {}
        experiences = resume.get("experience") or []
        exp_brief = [
            {
                "index": i,
                "company": e.get("company"),
                "position": e.get("position"),
                "description": (e.get("description") or "")[:400],
            }
            for i, e in enumerate(experiences)
        ]
        hint = title_hint or base_title
        title_angles = (
            "заголовок с акцентом React и Next.js",
            "заголовок с акцентом TypeScript и frontend-архитектура",
            "заголовок Middle Frontend / продуктовая разработка",
        )
        angle = title_angles[(index - 1) % len(title_angles)]
        query = (
            f"Сделай вариант #{index} резюме. Базовый title: {base_title!r}. "
            f"Подсказка: {hint!r}. Угол для title: {angle}. "
            "title обязан отличаться от базового и быть уникальным среди вариантов. "
            f"Текущие skills: {resume.get('skill_set') or resume.get('skills')}. "
            f"Опыт (не меняй company/position/dates): {json.dumps(exp_brief, ensure_ascii=False)}. "
            "Верни JSON: "
            '{"title":"...", "skill_set":["..."], '
            '"experience":[{"index":0,"description":"..."}]}'
        )
        try:
            raw = ai.complete(query)
        except AIError as ex:
            raise RuntimeError(f"AI variant {index}: {ex}") from ex
        return self._parse_variant_json(raw)

    @staticmethod
    def _parse_variant_json(raw: str) -> dict[str, Any]:
        text = raw.strip()
        fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
        if fence:
            text = fence.group(1).strip()
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start : end + 1]
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError("variant JSON must be an object")
        return data
