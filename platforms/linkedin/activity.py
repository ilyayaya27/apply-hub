"""Persistent cache and history for LinkedIn applies and connects (SSOT)."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

JobStatus = Literal[
    "applied",
    "already_applied",
    "blacklisted",
    "skipped",
    "failed",
    "dry_run",
]
ConnectStatus = Literal[
    "connected",
    "pending",
    "already_connected",
    "skipped",
    "failed",
    "dry_run",
]

DEFAULT_ACTIVITY_PATH = os.path.join("data", "activity.json")
JOB_SKIP_STATUSES = frozenset({"applied", "already_applied", "blacklisted", "skipped"})
CONNECT_SKIP_STATUSES = frozenset(
    {"connected", "pending", "already_connected", "skipped"}
)
JOB_ID_RE = re.compile(r"/jobs/view/(\d+)")
PROFILE_RE = re.compile(r"linkedin\.com/in/([^/?#]+)", re.I)


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_job_id(job_id: str | int) -> str:
    return str(job_id).strip()


def normalize_profile_url(url: str) -> str:
    url = (url or "").strip().split("?")[0].rstrip("/")
    if url and not url.startswith("http"):
        url = f"https://www.linkedin.com/in/{url.lstrip('/')}"
    return url


def job_url(job_id: str | int) -> str:
    return f"https://www.linkedin.com/jobs/view/{normalize_job_id(job_id)}"


@dataclass
class JobRecord:
    url: str
    status: JobStatus
    title: str = ""
    company: str = ""
    location: str = ""
    recorded_at: str = ""
    updated_at: str = ""

    @classmethod
    def from_dict(cls, job_id: str, data: dict[str, Any]) -> JobRecord:
        return cls(
            url=data.get("url") or job_url(job_id),
            status=data.get("status", "skipped"),
            title=data.get("title") or "",
            company=data.get("company") or "",
            location=data.get("location") or "",
            recorded_at=data.get("recorded_at") or "",
            updated_at=data.get("updated_at") or "",
        )


@dataclass
class ConnectRecord:
    url: str
    status: ConnectStatus
    name: str = ""
    source: str = ""
    recorded_at: str = ""
    updated_at: str = ""

    @classmethod
    def from_dict(cls, url: str, data: dict[str, Any]) -> ConnectRecord:
        return cls(
            url=url,
            status=data.get("status", "skipped"),
            name=data.get("name") or "",
            source=data.get("source") or "",
            recorded_at=data.get("recorded_at") or "",
            updated_at=data.get("updated_at") or "",
        )


@dataclass
class ActivityState:
    version: int = 1
    jobs: dict[str, dict[str, Any]] = field(default_factory=dict)
    connects: dict[str, dict[str, Any]] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> ActivityState:
        if not data:
            return cls()
        return cls(
            version=int(data.get("version") or 1),
            jobs=dict(data.get("jobs") or {}),
            connects=dict(data.get("connects") or {}),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "jobs": self.jobs,
            "connects": self.connects,
        }


class ActivityStore:
    def __init__(self, path: str = DEFAULT_ACTIVITY_PATH) -> None:
        self.path = path
        self.state = self._load()

    def _load(self) -> ActivityState:
        if not os.path.exists(self.path):
            return ActivityState()
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                return ActivityState.from_dict(json.load(f))
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            return ActivityState()

    def save(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.state.to_dict(), f, indent=2, ensure_ascii=False)

    def should_skip_job(self, job_id: str | int) -> bool:
        key = normalize_job_id(job_id)
        entry = self.state.jobs.get(key)
        if not entry:
            return False
        return entry.get("status") in JOB_SKIP_STATUSES

    def record_job(
        self,
        job_id: str | int,
        status: JobStatus,
        *,
        title: str = "",
        company: str = "",
        location: str = "",
    ) -> None:
        key = normalize_job_id(job_id)
        now = _utc_now()
        existing = self.state.jobs.get(key) or {}
        self.state.jobs[key] = {
            "url": existing.get("url") or job_url(key),
            "status": status,
            "title": title or existing.get("title") or "",
            "company": company or existing.get("company") or "",
            "location": location or existing.get("location") or "",
            "recorded_at": existing.get("recorded_at") or now,
            "updated_at": now,
        }
        self.save()

    def get_job(self, job_id: str | int) -> JobRecord | None:
        key = normalize_job_id(job_id)
        data = self.state.jobs.get(key)
        if not data:
            return None
        return JobRecord.from_dict(key, data)

    def should_skip_connect(self, profile_url: str) -> bool:
        key = self._connect_key(profile_url)
        if not key:
            return False
        entry = self.state.connects.get(key)
        if not entry:
            return False
        return entry.get("status") in CONNECT_SKIP_STATUSES

    def record_connect(
        self,
        profile_url: str,
        status: ConnectStatus,
        *,
        name: str = "",
        source: str = "",
    ) -> None:
        key = self._connect_key(profile_url)
        if not key:
            return
        now = _utc_now()
        existing = self.state.connects.get(key) or {}
        self.state.connects[key] = {
            "url": key,
            "status": status,
            "name": name or existing.get("name") or "",
            "source": source or existing.get("source") or "",
            "recorded_at": existing.get("recorded_at") or now,
            "updated_at": now,
        }
        self.save()

    def get_connect(self, profile_url: str) -> ConnectRecord | None:
        key = self._connect_key(profile_url)
        if not key:
            return None
        data = self.state.connects.get(key)
        if not data:
            return None
        return ConnectRecord.from_dict(key, data)

    def migrate_connected_profiles(self, urls: list[str]) -> int:
        """Import legacy connected_profiles from quotas.json (one-time merge)."""
        added = 0
        for raw in urls:
            key = self._connect_key(raw)
            if not key or key in self.state.connects:
                continue
            now = _utc_now()
            self.state.connects[key] = {
                "url": key,
                "status": "connected",
                "name": "",
                "source": "legacy_quotas",
                "recorded_at": now,
                "updated_at": now,
            }
            added += 1
        if added:
            self.save()
        return added

    def backfill_from_daily_logs(self, data_dir: str = "data") -> int:
        """Parse Applied Jobs DATA *.txt and mark applied job IDs."""
        if not os.path.isdir(data_dir):
            return 0
        added = 0
        pattern = re.compile(
            r"Just Applied to this job:\s*(https://www\.linkedin\.com/jobs/view/\d+)",
            re.I,
        )
        for name in sorted(os.listdir(data_dir)):
            if not name.startswith("Applied Jobs DATA"):
                continue
            path = os.path.join(data_dir, name)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    text = f.read()
            except OSError:
                continue
            for match in pattern.finditer(text):
                job_id = self._job_id_from_url(match.group(1))
                if not job_id:
                    continue
                if job_id in self.state.jobs:
                    continue
                self.record_job(job_id, "applied")
                added += 1
        return added

    def summary(self) -> dict[str, Any]:
        jobs_by_status: dict[str, int] = {}
        for entry in self.state.jobs.values():
            status = str(entry.get("status") or "unknown")
            jobs_by_status[status] = jobs_by_status.get(status, 0) + 1

        connects_by_status: dict[str, int] = {}
        for entry in self.state.connects.values():
            status = str(entry.get("status") or "unknown")
            connects_by_status[status] = connects_by_status.get(status, 0) + 1

        return {
            "jobs_total": len(self.state.jobs),
            "jobs_by_status": jobs_by_status,
            "connects_total": len(self.state.connects),
            "connects_by_status": connects_by_status,
        }

    def format_report(self) -> str:
        s = self.summary()
        lines = [
            "=== LinkedIn activity cache ===",
            f"Jobs tracked: {s['jobs_total']}",
        ]
        for status, count in sorted(s["jobs_by_status"].items()):
            lines.append(f"  {status}: {count}")
        lines.append(f"Connects tracked: {s['connects_total']}")
        for status, count in sorted(s["connects_by_status"].items()):
            lines.append(f"  {status}: {count}")

        recent_jobs = sorted(
            self.state.jobs.items(),
            key=lambda item: item[1].get("updated_at") or "",
            reverse=True,
        )[:5]
        if recent_jobs:
            lines.append("")
            lines.append("Recent applies:")
            for job_id, entry in recent_jobs:
                title = entry.get("title") or job_id
                lines.append(
                    f"  [{entry.get('status')}] {title} — {entry.get('url')}"
                )

        recent_connects = sorted(
            self.state.connects.items(),
            key=lambda item: item[1].get("updated_at") or "",
            reverse=True,
        )[:5]
        if recent_connects:
            lines.append("")
            lines.append("Recent connects:")
            for url, entry in recent_connects:
                name = entry.get("name") or url.rsplit("/", 1)[-1]
                lines.append(f"  [{entry.get('status')}] {name} — {url}")

        return "\n".join(lines)

    @staticmethod
    def _connect_key(profile_url: str) -> str:
        normalized = normalize_profile_url(profile_url)
        if not normalized:
            return ""
        return normalized.rstrip("/").lower()

    @staticmethod
    def _job_id_from_url(url: str) -> str:
        match = JOB_ID_RE.search(url or "")
        return match.group(1) if match else ""
