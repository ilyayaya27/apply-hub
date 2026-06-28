#!/usr/bin/env python3
import os
import tempfile
import unittest

from activity import ActivityStore, job_url


class ActivityStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json")
        self.tmp.close()
        self.store = ActivityStore(self.tmp.name)

    def tearDown(self) -> None:
        os.unlink(self.tmp.name)

    def test_job_cache_skips_terminal_statuses(self) -> None:
        self.store.record_job("4430389701", "applied")
        self.assertTrue(self.store.should_skip_job("4430389701"))
        self.assertTrue(self.store.should_skip_job(4430389701))

        self.store.record_job("999", "failed")
        self.assertFalse(self.store.should_skip_job("999"))

    def test_connect_normalization_and_skip(self) -> None:
        url = "https://www.linkedin.com/in/recruiter/"
        self.store.record_connect(url, "connected", name="Jane")
        self.assertTrue(self.store.should_skip_connect("https://www.linkedin.com/in/recruiter"))
        record = self.store.get_connect(url)
        self.assertIsNotNone(record)
        assert record is not None
        self.assertEqual(record.name, "Jane")

    def test_migrate_legacy_profiles(self) -> None:
        added = self.store.migrate_connected_profiles(
            [
                "https://www.linkedin.com/in/legacy-user",
                "https://www.linkedin.com/in/legacy-user/",
            ]
        )
        self.assertEqual(added, 1)
        self.assertTrue(self.store.should_skip_connect("https://www.linkedin.com/in/legacy-user"))

    def test_backfill_from_daily_log(self) -> None:
        data_dir = tempfile.mkdtemp()
        log_path = os.path.join(data_dir, "Applied Jobs DATA - 20260624.txt")
        with open(log_path, "w", encoding="utf-8") as f:
            f.write(
                "1 | title | co | * 🥳 Just Applied to this job: "
                "https://www.linkedin.com/jobs/view/4426610387\n"
            )
        try:
            added = self.store.backfill_from_daily_logs(data_dir)
            self.assertEqual(added, 1)
            self.assertTrue(self.store.should_skip_job("4426610387"))
            self.assertEqual(
                self.store.get_job("4426610387").url,
                job_url("4426610387"),
            )
        finally:
            os.unlink(log_path)
            os.rmdir(data_dir)

    def test_summary_counts(self) -> None:
        self.store.record_job("1", "applied")
        self.store.record_job("2", "blacklisted")
        self.store.record_connect("https://www.linkedin.com/in/a", "connected")
        summary = self.store.summary()
        self.assertEqual(summary["jobs_total"], 2)
        self.assertEqual(summary["jobs_by_status"]["applied"], 1)
        self.assertEqual(summary["connects_total"], 1)


if __name__ == "__main__":
    unittest.main()
