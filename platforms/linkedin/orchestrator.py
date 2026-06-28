#!/usr/bin/env python3
"""Orchestrates apply + connect runs within daily/weekly quotas."""

from __future__ import annotations

import random
import sys
import time

import config
import utils
from quotas import QuotaManager

sys.stdout.reconfigure(encoding="utf-8")


def run_apply(plan_count: int) -> bool:
    if plan_count <= 0:
        return True
    config.maxApplicationsPerRun = plan_count
    from linkedin import Linkedin

    bot = Linkedin(quota=QuotaManager())
    try:
        bot.linkJobApply()
        return True
    except Exception as ex:
        utils.prRed(f"❌ Apply run failed: {ex}")
        return False
    finally:
        bot.driver.quit()


def run_connect(plan_count: int) -> bool:
    if plan_count <= 0:
        return True
    config.maxConnectsPerRun = plan_count
    from linkedin_connect import LinkedinConnect

    bot = LinkedinConnect(quota=QuotaManager())
    try:
        bot.link_people_connect()
        return True
    except Exception as ex:
        utils.prRed(f"❌ Connect run failed: {ex}")
        return False
    finally:
        bot.driver.quit()


def main() -> None:
    quota = QuotaManager()
    plan = quota.build_run_plan()
    utils.prYellow(f"📋 Orchestrator plan: {quota.status_line()}")

    if plan.apply_count == 0 and plan.connect_count == 0:
        utils.prYellow("Nothing to do — daily/weekly quotas met or disabled.")
        return

    if plan.apply_count > 0:
        utils.prYellow(f"▶ Apply run ({plan.apply_count})")
        run_apply(plan.apply_count)
        time.sleep(random.uniform(30, 90))

    if plan.connect_count > 0:
        utils.prYellow(f"▶ Connect run ({plan.connect_count})")
        run_connect(plan.connect_count)

    utils.prGreen(f"✅ Cycle done. {QuotaManager().status_line()}")


if __name__ == "__main__":
    main()
