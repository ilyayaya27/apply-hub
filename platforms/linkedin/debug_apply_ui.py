#!/usr/bin/env python3
"""Inspect LinkedIn job page apply-button DOM (one job)."""
import hashlib
import os
import pickle
import sys
import time

import config
import utils
from selenium import webdriver
from selenium.webdriver.common.by import By

SEARCH_URL = (
    "https://www.linkedin.com/jobs/search/"
    "?f_AL=true&keywords=frontend&f_WT=2%2C3&location=Germany"
    "&f_E=3%2C4&f_TPR=r604800&sortBy=DD"
)


def cookie_path() -> str:
    digest = hashlib.md5(config.email.encode("utf-8")).hexdigest()
    return os.path.join(os.getcwd(), "cookies", f"{digest}.pkl")


def main() -> int:
    driver = webdriver.Chrome(options=utils.chromeBrowserOptions())
    try:
        driver.get("https://www.linkedin.com")
        time.sleep(2)
        with open(cookie_path(), "rb") as f:
            for c in pickle.load(f):
                sanitized = utils.sanitize_linkedin_cookie(c)
                if not sanitized:
                    continue
                try:
                    driver.add_cookie(sanitized)
                except Exception:
                    pass
        driver.get(SEARCH_URL)
        time.sleep(5)
        print("search_url", driver.current_url)
        jobs = driver.find_elements(By.CSS_SELECTOR, "li[data-occludable-job-id]")
        print("job_cards", len(jobs))
        if not jobs:
            print("NO_JOB_CARDS")
            print(driver.page_source[:3000])
            return 1

        job_id = jobs[0].get_attribute("data-occludable-job-id").split(":")[-1]
        job_url = f"https://www.linkedin.com/jobs/view/{job_id}"
        print("job_url", job_url)
        driver.get(job_url)
        time.sleep(5)
        print("job_page_url", driver.current_url)

        selectors = [
            ("css", "button.jobs-apply-button"),
            ("css", "div.jobs-apply-button--top-card button"),
            ("xpath", "//button[contains(@class,'jobs-apply-button')]"),
            ("xpath", "//button[contains(., 'Easy Apply')]"),
            ("xpath", "//a[contains(@class,'jobs-apply-button')]"),
            ("css", "a[data-view-name='job-apply-button']"),
            ("css", "button[data-view-name='job-apply-button']"),
            ("xpath", "//*[contains(@aria-label,'Easy Apply')]"),
        ]
        for kind, sel in selectors:
            try:
                if kind == "css":
                    els = driver.find_elements(By.CSS_SELECTOR, sel)
                else:
                    els = driver.find_elements(By.XPATH, sel)
                print(f"{kind}:{sel} -> {len(els)}", end="")
                if els:
                    el = els[0]
                    print(
                        f" | tag={el.tag_name} text={el.text[:80]!r} "
                        f"aria={el.get_attribute('aria-label')!r} "
                        f"class={el.get_attribute('class')!r}"
                    )
                else:
                    print()
            except Exception as e:
                print(f"{kind}:{sel} ERROR {e}")

        # Any apply-ish buttons
        for el in driver.find_elements(By.TAG_NAME, "button")[:80]:
            txt = (el.text or "").strip()
            aria = el.get_attribute("aria-label") or ""
            if "apply" in txt.lower() or "apply" in aria.lower():
                print(
                    "BUTTON",
                    repr(txt[:60]),
                    "aria=",
                    repr(aria[:80]),
                    "class=",
                    repr((el.get_attribute("class") or "")[:100]),
                )
        return 0
    finally:
        driver.quit()


if __name__ == "__main__":
    sys.exit(main())
