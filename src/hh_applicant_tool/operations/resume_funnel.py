"""Воронка откликов в разрезе резюме (A/B-атрибуция).

Тянет /negotiations (с пагинацией) и /resumes/mine, группирует по резюме:
отклик → просмотр работодателем → приглашение / отказ, + просмотры резюме.
Так видно, какой из A/B-вариантов реально приносит приглашения.
"""
from __future__ import annotations

import argparse
import logging
from typing import TYPE_CHECKING, Any

from ..main import BaseNamespace, BaseOperation
from ..utils.string import shorten

if TYPE_CHECKING:
    from ..main import HHApplicantTool

logger = logging.getLogger(__package__)


class Namespace(BaseNamespace):
    pass


def _fetch_all_negotiations(api: Any) -> list[dict]:
    items: list[dict] = []
    page = 0
    while True:
        r = api.get("/negotiations", page=page, per_page=100)
        batch = r.get("items", [])
        items.extend(batch)
        pages = r.get("pages", 1)
        page += 1
        if page >= pages or not batch:
            break
    return items


class Operation(BaseOperation):
    """Воронка откликов по резюме (A/B-атрибуция)"""

    __aliases__ = ["resume-funnel", "funnel"]

    def setup_parser(self, parser: argparse.ArgumentParser) -> None:
        pass

    def run(self, tool: HHApplicantTool, args: Namespace) -> None:
        api = tool.api_client

        resumes = tool.get_resumes()
        # rid -> агрегаты
        stats: dict[str, dict[str, Any]] = {}
        for r in resumes:
            stats[r["id"]] = {
                "title": r.get("title", "—"),
                "new_views": r.get("new_views") or 0,
                "applied": 0,
                "viewed": 0,
                "invited": 0,
                "discarded": 0,
                "response": 0,
                "messages": 0,
            }

        negotiations = _fetch_all_negotiations(api)
        for n in negotiations:
            rid = (n.get("resume") or {}).get("id")
            s = stats.get(rid)
            if s is None:
                # отклик со старого/удалённого резюме — заводим строку на лету
                s = stats[rid or "?"] = {
                    "title": (n.get("resume") or {}).get("title", "(другое резюме)"),
                    "new_views": 0, "applied": 0, "viewed": 0, "invited": 0,
                    "discarded": 0, "response": 0, "messages": 0,
                }
            s["applied"] += 1
            if n.get("viewed_by_opponent"):
                s["viewed"] += 1
            state = (n.get("state") or {}).get("id")
            # hh.ru отдаёт стадию приглашения как "interview" (не "invitation" —
            # тот id встречается в словаре, но реально в чатах не приходит)
            if state in ("invitation", "interview", "hired"):
                s["invited"] += 1
            elif state == "discard":
                s["discarded"] += 1
            elif state == "response":
                s["response"] += 1
            s["messages"] += (n.get("counters") or {}).get("messages", 0)

        rows = sorted(stats.values(), key=lambda x: (-x["invited"], -x["viewed"], -x["applied"]))

        def pct(a: int, b: int) -> str:
            return f"{round(100 * a / b)}%" if b else "—"

        print("\n📊 HH-воронка по резюме (A/B-атрибуция)\n")
        header = f"{'Резюме':<44} {'Откл':>5} {'Просм':>6} {'Пригл':>6} {'Отказ':>6} {'Views':>6}"
        print(header)
        print("─" * len(header))
        tot = {"applied": 0, "viewed": 0, "invited": 0, "discarded": 0, "new_views": 0}
        for r in rows:
            title = shorten(r["title"], 42)
            inv = f"{r['invited']} ({pct(r['invited'], r['applied'])})" if r["applied"] else "0"
            vw = f"{r['viewed']} ({pct(r['viewed'], r['applied'])})" if r["applied"] else "0"
            print(f"{title:<44} {r['applied']:>5} {vw:>6} {inv:>6} {r['discarded']:>6} {r['new_views']:>6}")
            for k in tot:
                tot[k] += r[k]
        print("─" * len(header))
        print(f"{'ИТОГО':<44} {tot['applied']:>5} "
              f"{tot['viewed']:>6} {tot['invited']:>6} {tot['discarded']:>6} {tot['new_views']:>6}")

        print(f"\nОтклики: {tot['applied']} · просмотрено работодателем: {tot['viewed']} "
              f"({pct(tot['viewed'], tot['applied'])}) · приглашений: {tot['invited']} "
              f"({pct(tot['invited'], tot['applied'])}) · отказов: {tot['discarded']}")
        best_views = max(rows, key=lambda x: x["new_views"], default=None)
        if best_views and best_views["new_views"]:
            print(f"🏆 Больше всего просмотров: {shorten(best_views['title'], 50)} "
                  f"({best_views['new_views']})")
        best_inv = max(rows, key=lambda x: x["invited"], default=None)
        if best_inv and best_inv["invited"]:
            print(f"🎯 Больше всего приглашений: {shorten(best_inv['title'], 50)} "
                  f"({best_inv['invited']})")
