#!/usr/bin/env python3
import os
import tempfile
import unittest
from datetime import date
from unittest.mock import patch

import config
import quotas


class QuotaManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json")
        self.tmp.close()
        self.manager = quotas.QuotaManager(self.tmp.name)

    def tearDown(self) -> None:
        os.unlink(self.tmp.name)

    @patch.object(quotas, "date")
    def test_daily_apply_limit(self, mock_date: unittest.mock.MagicMock) -> None:
        mock_date.today.return_value = date(2026, 6, 23)
        config.maxApplicationsPerDay = 2
        config.maxApplicationsPerRun = 5
        config.connectEnabled = False
        config.applyEnabled = True

        self.manager.record_apply()
        plan = self.manager.build_run_plan()
        self.assertEqual(plan.apply_count, 1)
        self.assertEqual(plan.applies_remaining_today, 1)

        self.manager.record_apply()
        plan = self.manager.build_run_plan()
        self.assertEqual(plan.apply_count, 0)
        self.assertEqual(plan.applies_remaining_today, 0)

    @patch.object(quotas, "date")
    def test_weekly_connect_limit(self, mock_date: unittest.mock.MagicMock) -> None:
        mock_date.today.return_value = date(2026, 6, 23)
        config.maxConnectsPerWeek = 5
        config.maxConnectsPerDay = 5
        config.maxConnectsPerRun = 2
        config.applyEnabled = False
        config.connectEnabled = True

        for i in range(4):
            self.manager.record_connect(f"https://www.linkedin.com/in/user{i}")

        plan = self.manager.build_run_plan()
        self.assertEqual(plan.connect_count, 1)
        self.assertEqual(plan.connects_remaining_week, 1)
        self.assertTrue(self.manager.has_connected("https://www.linkedin.com/in/user0/"))

    @patch.object(quotas, "date")
    def test_daily_connect_spread(self, mock_date: unittest.mock.MagicMock) -> None:
        mock_date.today.return_value = date(2026, 6, 23)  # Tuesday, 6 days left in week
        config.maxConnectsPerWeek = 20
        config.maxConnectsPerDay = 3
        config.maxConnectsPerRun = 1
        config.applyEnabled = False
        config.connectEnabled = True
        self.manager.record_connect("https://www.linkedin.com/in/a")

        budget = self.manager.spread_connect_budget()
        self.assertEqual(budget, 3)
        plan = self.manager.build_run_plan()
        self.assertEqual(plan.connect_count, 1)
        self.assertEqual(plan.connects_remaining_week, 19)

        for _ in range(3):
            self.manager.record_connect("https://www.linkedin.com/in/x")
        plan = self.manager.build_run_plan()
        self.assertEqual(plan.connect_count, 0)
        self.assertEqual(plan.connects_today, 4)

    @patch.object(quotas, "date")
    def test_persists_state(self, mock_date: unittest.mock.MagicMock) -> None:
        mock_date.today.return_value = date(2026, 6, 23)
        self.manager.record_apply(2)
        self.manager.record_connect("https://www.linkedin.com/in/recruiter")

        reloaded = quotas.QuotaManager(self.tmp.name)
        self.assertEqual(reloaded.applies_today(), 2)
        self.assertEqual(reloaded.connects_this_week(), 1)
        self.assertEqual(reloaded.connects_today(), 1)


if __name__ == "__main__":
    unittest.main()
