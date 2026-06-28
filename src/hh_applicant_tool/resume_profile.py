from __future__ import annotations

from typing import Any


def clone_resume_profile(api_client: Any, resume_id: str) -> str:
    result = api_client.post(
        "/resume_profile",
        {
            "additional_properties": {"any_job": True},
            "clone_resume_id": resume_id,
        },
        as_json=True,
    )
    if isinstance(result.get("resume"), dict) and result["resume"].get("id"):
        return result["resume"]["id"]
    if result.get("id"):
        return result["id"]
    raise ValueError(f"Не удалось получить id клона из ответа: {result!r}")


def fetch_resume_profile(api_client: Any, resume_id: str) -> dict[str, Any]:
    return api_client.get(f"/resume_profile/{resume_id}")


def update_resume_profile(
    api_client: Any, resume_id: str, body: dict[str, Any]
) -> dict[str, Any]:
    return api_client.put(
        f"/resume_profile/{resume_id}", body, as_json=True
    )


def publish_resume(api_client: Any, resume_id: str) -> None:
    api_client.post(f"/resumes/{resume_id}/publish")
