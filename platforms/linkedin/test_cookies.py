#!/usr/bin/env python3
import unittest

from utils import sanitize_linkedin_cookie


class SanitizeLinkedinCookieTests(unittest.TestCase):
    def test_fixes_dot_www_domain(self) -> None:
        raw = {
            "name": "li_at",
            "value": "token",
            "domain": ".www.linkedin.com",
            "path": "/",
            "secure": True,
        }
        out = sanitize_linkedin_cookie(raw)
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out["domain"], ".linkedin.com")

    def test_keeps_linkedin_domain(self) -> None:
        raw = {"name": "JSESSIONID", "value": "x", "domain": ".linkedin.com"}
        out = sanitize_linkedin_cookie(raw)
        self.assertEqual(out["domain"], ".linkedin.com")

    def test_drops_invalid_same_site(self) -> None:
        raw = {"name": "x", "value": "1", "sameSite": "no_restriction"}
        out = sanitize_linkedin_cookie(raw)
        self.assertNotIn("sameSite", out)

    def test_requires_name_and_value(self) -> None:
        self.assertIsNone(sanitize_linkedin_cookie({"name": "x"}))
        self.assertIsNone(sanitize_linkedin_cookie({"value": "1"}))


if __name__ == "__main__":
    unittest.main()
