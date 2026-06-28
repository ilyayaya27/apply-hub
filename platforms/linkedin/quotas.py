"""Daily/weekly quotas for LinkedIn automation (single source of truth)."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import date
from typing import Any

import config
from activity import ActivityStore

DEFAULT_STATE_PATH = os.path.join("data", "quotas.json")


def _today_key() -> str:
    return date.today().isoformat()


def _week_key() -> str:
    today = date.today()
    return f"{today.isocalendar().year}-W{today.isocalendar().week:02d}"


def _days_left_in_iso_week() -> int:
    """Days left in ISO week including today (Mon=7 … Sun=1)."""
    return max(1, 8 - date.today().isocalendar().weekday)


@dataclass
class QuotaState:
    applies: dict[str, int] = field(default_factory=dict)
    connects: dict[str, int] = field(default_factory=dict)
    connects_daily: dict[str, int] = field(default_factory=dict)
    connected_profiles: list[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> QuotaState:
        if not data:
            return cls()
        return cls(
            applies={str(k): int(v) for k, v in (data.get("applies") or {}).items()},
            connects={str(k): int(v) for k, v in (data.get("connects") or {}).items()},
            connects_daily={
                str(k): int(v) for k, v in (data.get("connects_daily") or {}).items()
            },
            connected_profiles=list(data.get("connected_profiles") or []),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "applies": self.applies,
            "connects": self.connects,
            "connects_daily": self.connects_daily,
            "connected_profiles": self.connected_profiles,
        }


@dataclass
class RunPlan:
    apply_count: int
    connect_count: int
    applies_today: int
    connects_today: int
    connects_week: int
    applies_remaining_today: int
    connects_remaining_today: int
    connects_remaining_week: int
    connect_daily_budget: int


class QuotaManager:
    def __init__(
        self,
        state_path: str = DEFAULT_STATE_PATH,
        activity: ActivityStore | None = None,
    ) -> None:
        self.state_path = state_path
        self.state = self._load()
        self.activity = activity or ActivityStore()
        self.activity.migrate_connected_profiles(self.state.connected_profiles)

    def _load(self) -> QuotaState:
        if not os.path.exists(self.state_path):
            return QuotaState()
        try:
            with open(self.state_path, "r", encoding="utf-8") as f:
                return QuotaState.from_dict(json.load(f))
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            return QuotaState()

    def save(self) -> None:
        os.makedirs(os.path.dirname(self.state_path) or ".", exist_ok=True)
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump(self.state.to_dict(), f, indent=2, ensure_ascii=False)

    def applies_today(self) -> int:
        return self.state.applies.get(_today_key(), 0)

    def connects_today(self) -> int:
        return self.state.connects_daily.get(_today_key(), 0)

    def connects_this_week(self) -> int:
        return self.state.connects.get(_week_key(), 0)

    def remaining_applies_today(self) -> int:
        return max(0, int(config.maxApplicationsPerDay) - self.applies_today())

    def remaining_connects_today(self) -> int:
        return max(0, int(config.maxConnectsPerDay) - self.connects_today())

    def remaining_connects_week(self) -> int:
        return max(0, int(config.maxConnectsPerWeek) - self.connects_this_week())

    def spread_connect_budget(self) -> int:
        """Evenly spread remaining weekly connects over days left in the week."""
        remaining_week = self.remaining_connects_week()
        if remaining_week <= 0:
            return 0
        days_left = _days_left_in_iso_week()
        even_split = (remaining_week + days_left - 1) // days_left
        return min(int(config.maxConnectsPerDay), even_split)

    def has_connected(self, profile_url: str) -> bool:
        return self.activity.should_skip_connect(profile_url)

    def record_apply(self, count: int = 1) -> None:
        if count <= 0:
            return
        key = _today_key()
        self.state.applies[key] = self.state.applies.get(key, 0) + count
        self.save()

    def record_connect(self, profile_url: str, *, source: str = "connect_run") -> None:
        week_key = _week_key()
        day_key = _today_key()
        self.state.connects[week_key] = self.state.connects.get(week_key, 0) + 1
        self.state.connects_daily[day_key] = self.state.connects_daily.get(day_key, 0) + 1
        normalized = profile_url.rstrip("/")
        if normalized not in self.state.connected_profiles:
            self.state.connected_profiles.append(normalized)
        self.activity.record_connect(profile_url, "connected", source=source)
        self.save()

    def build_run_plan(self) -> RunPlan:
        applies_remaining = self.remaining_applies_today()
        connects_remaining_week = self.remaining_connects_week()
        connects_remaining_today = self.remaining_connects_today()
        daily_budget = self.spread_connect_budget()

        apply_count = 0
        connect_count = 0

        if getattr(config, "applyEnabled", True) and applies_remaining > 0:
            apply_count = min(
                applies_remaining,
                int(config.maxApplicationsPerRun),
            )

        if getattr(config, "connectEnabled", True) and connects_remaining_week > 0:
            connect_count = min(
                connects_remaining_today,
                daily_budget,
                connects_remaining_week,
                int(config.maxConnectsPerRun),
            )

        return RunPlan(
            apply_count=apply_count,
            connect_count=connect_count,
            applies_today=self.applies_today(),
            connects_today=self.connects_today(),
            connects_week=self.connects_this_week(),
            applies_remaining_today=applies_remaining,
            connects_remaining_today=connects_remaining_today,
            connects_remaining_week=connects_remaining_week,
            connect_daily_budget=daily_budget,
        )

    def status_line(self) -> str:
        plan = self.build_run_plan()
        return (
            f"applies today {plan.applies_today}/{config.maxApplicationsPerDay} "
            f"(+{plan.apply_count}), "
            f"connects today {plan.connects_today}/{config.maxConnectsPerDay} "
            f"(budget {plan.connect_daily_budget}, +{plan.connect_count}), "
            f"week {plan.connects_week}/{config.maxConnectsPerWeek}"
        )
