#!/usr/bin/env python3
"""Print LinkedIn apply/connect cache and statistics."""

from __future__ import annotations

import argparse

from activity import ActivityStore, DEFAULT_ACTIVITY_PATH
from quotas import QuotaManager


def main() -> None:
    parser = argparse.ArgumentParser(description="LinkedIn activity cache report")
    parser.add_argument(
        "--backfill",
        action="store_true",
        help="Import job IDs from data/Applied Jobs DATA *.txt before report",
    )
    parser.add_argument(
        "--path",
        default=DEFAULT_ACTIVITY_PATH,
        help=f"Activity JSON path (default: {DEFAULT_ACTIVITY_PATH})",
    )
    args = parser.parse_args()

    store = ActivityStore(args.path)
    migrated = store.migrate_connected_profiles(
        QuotaManager().state.connected_profiles
    )
    if args.backfill:
        imported = store.backfill_from_daily_logs()
        print(f"Backfill: +{imported} jobs from daily logs, +{migrated} legacy connects")
    elif migrated:
        print(f"Migrated {migrated} legacy connect profile(s) into activity cache")

    print(store.format_report())
    print("")
    print("=== Quota counters (today / week) ===")
    quota = QuotaManager()
    print(quota.status_line())


if __name__ == "__main__":
    main()
