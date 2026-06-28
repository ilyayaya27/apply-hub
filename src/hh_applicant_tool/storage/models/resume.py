from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping, Self

from .base import BaseModel, mapped


def _coalesce_str(value: object) -> str:
    return value if isinstance(value, str) else ""


class ResumeModel(BaseModel):
    id: str
    title: str = mapped(transform=_coalesce_str, default="")
    url: str
    alternate_url: str
    status_id: str = mapped(path="status.id")
    status_name: str = mapped(path="status.name")
    can_publish_or_update: bool = False
    total_views: int = mapped(path="counters.total_views", default=0)
    new_views: int = mapped(path="counters.new_views", default=0)
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_api(cls, data: Mapping[str, Any]) -> Self:
        patched = dict(data)
        if patched.get("title") is None:
            patched["title"] = ""
        return cls._from_mapping(patched, from_source=True)
