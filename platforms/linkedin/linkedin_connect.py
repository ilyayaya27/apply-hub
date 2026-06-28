import random
import sys
import time
from typing import Optional

import config
import constants
import utils
from linkedin import Linkedin
from quotas import QuotaManager
from selenium.webdriver.common.by import By

sys.stdout.reconfigure(encoding="utf-8")


class LinkedinConnect(Linkedin):
    def __init__(self, quota: Optional[QuotaManager] = None) -> None:
        super().__init__()
        self.quota = quota or QuotaManager()

    def _all_roots_js(self) -> str:
        return """
        function getAllRoots() {
          const roots = [];
          function walk(node) {
            if (!node || roots.includes(node)) return;
            roots.push(node);
            node.querySelectorAll('*').forEach(el => {
              if (el.shadowRoot) walk(el.shadowRoot);
            });
          }
          walk(document);
          return roots;
        }
        """

    def _click_button_all_roots(self, labels: list[str]) -> bool:
        script = (
            self._all_roots_js()
            + """
        const labels = arguments[0].map(l => l.toLowerCase());
        for (const root of getAllRoots()) {
          for (const el of root.querySelectorAll('button, a, [role="button"], [role="menuitem"]')) {
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            const text = (el.innerText || '').trim().toLowerCase();
            if (/^(skip to|home|me|for business|messaging)/i.test(aria)) continue;
            for (const label of labels) {
              if (aria.includes(label) || text === label || text.includes(label)) {
                el.click();
                return true;
              }
            }
          }
        }
        return false;
        """
        )
        try:
            return bool(self.driver.execute_script(script, labels))
        except Exception:
            return False

    def _fill_connect_note_all_roots(self, note: str) -> None:
        script = (
            self._all_roots_js()
            + """
        const note = arguments[0];
        function setNativeValue(el, value) {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
          ).set;
          setter.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        for (const root of getAllRoots()) {
          for (const el of root.querySelectorAll('textarea')) {
            if (!el.value) {
              setNativeValue(el, note);
              return;
            }
          }
        }
        """
        )
        try:
            self.driver.execute_script(script, note)
        except Exception:
            pass

    def _primary_profile_state(self) -> str:
        script = """
        const main = document.querySelector('main');
        if (!main) return '';
        const buttons = [...main.querySelectorAll('button[aria-label]')].slice(0, 12);
        return buttons.map(b => (b.innerText || b.getAttribute('aria-label') || '')).join(' | ');
        """
        try:
            return (self.driver.execute_script(script) or "").lower()
        except Exception:
            return ""

    def _click_profile_connect(self) -> bool:
        try:
            main = self.driver.find_element(By.CSS_SELECTOR, "main")
            more_buttons = main.find_elements(
                By.CSS_SELECTOR, 'button[aria-label="More"]'
            )
            if not more_buttons:
                return False
            more_buttons[0].click()
            time.sleep(1.5)
            invite_links = self.driver.find_elements(
                By.CSS_SELECTOR, 'a[role="menuitem"][href*="custom-invite"]'
            )
            if invite_links:
                invite_links[0].click()
                return True
        except Exception:
            pass
        return False

    def _complete_connect_modal(self, note: str = "") -> bool:
        time.sleep(random.uniform(1.5, constants.botSpeed + 1))

        if note:
            self._click_button_all_roots(["add a note"])
            time.sleep(0.8)
            self._fill_connect_note_all_roots(note)
            time.sleep(0.5)
            if self._click_button_all_roots(["send invitation", "send"]):
                return True

        if self._click_button_all_roots(["send without a note"]):
            return True

        state = self._primary_profile_state()
        return "pending" in state

    def send_connect(self, profile_url: str) -> str:
        if self.quota.has_connected(profile_url):
            return f"* ⏭️ Already tracked: {profile_url}"

        self.driver.get(profile_url)
        time.sleep(random.uniform(2, constants.botSpeed + 1))

        state = self._primary_profile_state()
        if "pending" in state:
            self.quota.activity.record_connect(
                profile_url, "pending", source="connect_run"
            )
            return f"* ⏭️ Pending: {profile_url}"
        if "message" in state and "connect" not in state:
            self.quota.activity.record_connect(
                profile_url, "already_connected", source="connect_run"
            )
            return f"* ⏭️ Already connected: {profile_url}"

        if not self._click_profile_connect():
            self.quota.activity.record_connect(
                profile_url, "skipped", source="connect_run"
            )
            return f"* ⏭️ No Connect (Follow-only or unavailable): {profile_url}"

        if getattr(config, "connectDryRun", False):
            self._click_button_all_roots(["dismiss", "close"])
            self.quota.activity.record_connect(
                profile_url, "dry_run", source="connect_run"
            )
            return f"* 🧪 DRY RUN - Would connect: {profile_url}"

        if not self._complete_connect_modal(getattr(config, "connectNote", "") or ""):
            raise RuntimeError("connect send button not reached")

        self.quota.record_connect(profile_url, source="connect_run")
        time.sleep(random.uniform(1, constants.botSpeed))
        return f"* 🤝 Connected: {profile_url}"

    def _collect_hiring_profiles_from_jobs(self, max_jobs: int = 40) -> list[str]:
        self.generateUrls()
        urls = utils.getUrlDataFile()
        profiles: list[str] = []
        seen: set[str] = set()

        for search_url in urls:
            if len(profiles) >= max_jobs:
                break
            self.driver.get(search_url)
            time.sleep(random.uniform(2, constants.botSpeed))

            try:
                offers = self.driver.find_elements(
                    By.XPATH, '//li[@data-occludable-job-id]'
                )
            except Exception:
                continue

            job_ids: list[str] = []
            for offer in offers[: max_jobs - len(profiles)]:
                try:
                    job_id = offer.get_attribute("data-occludable-job-id")
                    if job_id:
                        job_ids.append(str(job_id.split(":")[-1]))
                except Exception:
                    continue

            for job_id in job_ids:
                if len(profiles) >= max_jobs:
                    break
                if self.quota.activity.should_skip_job(job_id):
                    continue
                job_url = f"https://www.linkedin.com/jobs/view/{job_id}"
                self.driver.get(job_url)
                time.sleep(random.uniform(2, constants.botSpeed + 1))

                links = self.driver.execute_script(
                    """
                    function walk(root, out) {
                      root.querySelectorAll('a[href*="/in/"]').forEach(a => {
                        const href = a.href.split('?')[0].replace(/\\/$/, '');
                        const text = (a.innerText || '').toLowerCase();
                        if (!/linkedin\\.com\\/in\\/[^/]+$/i.test(href)) return;
                        if (text.includes('job poster') || text.includes('hiring team')
                            || text.includes('recruiter') || text.includes('talent')) {
                          out.push(href);
                        }
                      });
                      root.querySelectorAll('*').forEach(el => {
                        if (el.shadowRoot) walk(el.shadowRoot, out);
                      });
                    }
                    const out = [];
                    walk(document, out);
                    return [...new Set(out)];
                    """
                ) or []

                if not links:
                    links = self.driver.execute_script(
                        """
                        const out = new Set();
                        document.querySelectorAll('a[href*="/in/"]').forEach(a => {
                          const href = a.href.split('?')[0].replace(/\\/$/, '');
                          if (/linkedin\\.com\\/in\\/[^/]+$/i.test(href)) out.add(href);
                        });
                        return [...out].slice(0, 3);
                        """
                    ) or []

                for href in links:
                    key = href.lower()
                    if key not in seen:
                        seen.add(key)
                        profiles.append(href)

        return profiles

    def link_people_connect(self) -> None:
        count_sent = 0
        count_skipped = 0
        count_failed = 0
        start = time.time()
        cap = int(config.maxConnectsPerRun)
        remaining_week = self.quota.remaining_connects_week()
        cap = min(cap, remaining_week)

        if cap <= 0:
            utils.prYellow("🛑 Weekly connect quota reached, skipping.")
            return

        profiles = self._collect_hiring_profiles_from_jobs(max_jobs=cap * 4)
        utils.prGreen(
            f"✅ Hiring-team profiles collected: {len(profiles)}, cap this run: {cap}"
        )

        if not profiles:
            utils.prYellow("⚠️ No hiring profiles from jobs, skipping connect run.")
            return

        fresh_profiles: list[str] = []
        count_cache_skipped = 0
        for profile_url in profiles:
            if self.quota.activity.should_skip_connect(profile_url):
                count_cache_skipped += 1
            else:
                fresh_profiles.append(profile_url)
        profiles = fresh_profiles
        if count_cache_skipped:
            utils.prYellow(
                f"⏭️ Skipped {count_cache_skipped} profile(s) from activity cache."
            )

        for profile_url in profiles:
            if count_sent >= cap:
                break
            try:
                result = self.send_connect(profile_url)
                self.displayWriteResults(result)
                if "Connected" in result or "DRY RUN" in result:
                    count_sent += 1
                else:
                    count_skipped += 1
            except Exception as ex:
                count_failed += 1
                self.quota.activity.record_connect(
                    profile_url, "failed", source="connect_run"
                )
                self.displayWriteResults(f"* 🥵 Connect failed: {profile_url} ({ex})")
            time.sleep(random.uniform(4, constants.botSpeed + 3))

        duration = round((time.time() - start) / 60, 1)
        utils.prGreen(
            f"\n📊 CONNECT SUMMARY: sent={count_sent}, skipped={count_skipped}, "
            f"failed={count_failed}, duration={duration} min"
        )
        utils.prYellow(f"Quota: {self.quota.status_line()}")


def main() -> None:
    bot = LinkedinConnect()
    try:
        bot.link_people_connect()
    finally:
        bot.driver.quit()


if __name__ == "__main__":
    main()
