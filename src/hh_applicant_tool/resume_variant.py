from __future__ import annotations

import copy
from typing import Any


def _resume_section(body: dict[str, Any]) -> dict[str, Any]:
    if "resume" in body and isinstance(body["resume"], dict):
        return body["resume"]
    return body


def _experience_update_rows(
    draft_experience: list[dict[str, Any]],
    merged_experience: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, draft_row in enumerate(draft_experience):
        merged_row = (
            merged_experience[index]
            if index < len(merged_experience)
            else draft_row
        )
        row: dict[str, Any] = {
            "id": draft_row.get("id"),
            "company": draft_row.get("company"),
            "position": draft_row.get("position"),
            "start": draft_row.get("start"),
            "description": merged_row.get("description"),
        }
        if draft_row.get("end"):
            row["end"] = draft_row.get("end")
        rows.append(row)
    return rows


def build_variant_update_body(
    draft_profile: dict[str, Any],
    variant: dict[str, Any],
) -> dict[str, Any]:
    """Minimal PUT body for resume_profile (full profile breaks on setka_access)."""
    merged = apply_variant_texts(draft_profile, variant)
    draft_resume = _resume_section(draft_profile)
    merged_resume = _resume_section(merged)
    resume_out: dict[str, Any] = {}
    if title := merged_resume.get("title"):
        resume_out["title"] = title
    if skill_set := merged_resume.get("skill_set"):
        resume_out["skill_set"] = skill_set
    draft_exp = draft_resume.get("experience")
    if isinstance(draft_exp, list) and draft_exp:
        merged_exp = merged_resume.get("experience")
        if not isinstance(merged_exp, list):
            merged_exp = draft_exp
        resume_out["experience"] = _experience_update_rows(draft_exp, merged_exp)
    return {"resume": resume_out}


def apply_variant_texts(body: dict[str, Any], variant: dict[str, Any]) -> dict[str, Any]:
    """Patch title/skills/experience descriptions; keep companies and dates."""
    out = copy.deepcopy(body)
    resume = _resume_section(out)

    if title := variant.get("title"):
        resume["title"] = title
    if skills := variant.get("skills"):
        resume["skills"] = skills
    if skill_set := variant.get("skill_set"):
        resume["skill_set"] = skill_set

    exp_updates = {
        item["index"]: item["description"]
        for item in variant.get("experience", [])
        if isinstance(item, dict)
        and "index" in item
        and "description" in item
    }
    experience = resume.get("experience")
    if exp_updates and isinstance(experience, list):
        for index, description in exp_updates.items():
            if 0 <= index < len(experience):
                experience[index]["description"] = description

    return out
