import hashlib
import math
import os
import pickle
import random
import sys
import time
from typing import Optional

import config
import constants
import utils
from quotas import QuotaManager

sys.stdout.reconfigure(encoding='utf-8')

from selenium import webdriver
from selenium.webdriver.common.by import By

try:
    from selenium_stealth import stealth
    STEALTH_AVAILABLE = True
except ImportError:
    STEALTH_AVAILABLE = False

class Linkedin:
    def __init__(self, quota: Optional[QuotaManager] = None) -> None:
        self.quota = quota or QuotaManager()
        utils.prYellow("🤖 Thanks for using Easy Apply Jobs bot, for more information you can visit our site - www.automated-bots.com")
        utils.prYellow("🌐 Bot will run in Chrome browser and log in Linkedin for you.")
        
        # Selenium Manager picks chromedriver matching installed Chromium.
        self.driver = webdriver.Chrome(options=utils.chromeBrowserOptions())
        
        # Apply stealth mode if available
        if STEALTH_AVAILABLE:
            try:
                stealth(self.driver,
                        languages=["en-US", "en"],
                        vendor="Google Inc.",
                        platform="Win32",
                        webgl_vendor="Intel Inc.",
                        renderer="Intel Iris OpenGL Engine",
                        fix_hairline=True)
            except Exception as e:
                utils.prYellow(f"⚠️ Warning: Could not apply stealth mode: {str(e)}")
        
        self.cookies_path = f"{os.path.join(os.getcwd(),'cookies')}/{self.getHash(config.email)}.pkl"
        self.driver.get('https://www.linkedin.com')
        self.loadCookies()

        if not self.isLoggedIn():
            self.driver.get("https://www.linkedin.com/login?trk=guest_homepage-basic_nav-header-signin")
            utils.prYellow("🔄 Trying to log in Linkedin...")
            try:    
                self.driver.find_element("id","username").send_keys(config.email)
                time.sleep(2)
                self.driver.find_element("id","password").send_keys(config.password)
                time.sleep(2)
                self.driver.find_element("xpath",'//button[@type="submit"]').click()
                time.sleep(30)
            except Exception:
                utils.prRed("❌ Couldn't log in Linkedin by using Chrome. Please check your Linkedin credentials on config files line 7 and 8.")

            self.saveCookies()

    def getHash(self, string: str) -> str:
        return hashlib.md5(string.encode('utf-8')).hexdigest()

    def loadCookies(self) -> None:
        if not os.path.exists(self.cookies_path):
            return
        with open(self.cookies_path, "rb") as f:
            cookies = pickle.load(f)
        self.driver.delete_all_cookies()
        loaded = 0
        for cookie in cookies:
            sanitized = utils.sanitize_linkedin_cookie(cookie)
            if not sanitized:
                continue
            try:
                self.driver.add_cookie(sanitized)
                loaded += 1
            except Exception as ex:
                if config.displayWarnings:
                    utils.prYellow(
                        f"⚠️ skip cookie {sanitized.get('name')}: {str(ex)[:80]}"
                    )
        if loaded:
            self.driver.refresh()

    def saveCookies(self) -> None:
        try:
            # Get the directory path for cookies
            cookies_dir = os.path.dirname(self.cookies_path)
            
            # Create cookies directory if it doesn't exist
            if cookies_dir and not os.path.exists(cookies_dir):
                os.makedirs(cookies_dir, exist_ok=True)
            
            # Save cookies to file
            with open(self.cookies_path, "wb") as f:
                pickle.dump(self.driver.get_cookies(), f)
        except Exception as e:
            if config.displayWarnings:
                utils.prYellow(f"⚠️ Warning: Could not save cookies: {str(e)[0:100]}")
            # Don't raise the exception - cookie saving is not critical for bot operation
    
    def isLoggedIn(self) -> bool:
        self.driver.get('https://www.linkedin.com/feed/')
        time.sleep(3)
        url = self.driver.current_url
        if any(x in url for x in ("login", "checkpoint", "authwall")):
            return False
        try:
            self.driver.find_element(
                By.CSS_SELECTOR,
                "button.global-nav__primary-link-me-menu-trigger, img.global-nav__me-photo",
            )
            return True
        except Exception:
            return "/feed" in url
    
    def generateUrls(self) -> None:
        if not os.path.exists('data'):
            os.makedirs('data')
        try: 
            with open('data/urlData.txt', 'w',encoding="utf-8" ) as file:
                linkedinJobLinks = utils.LinkedinUrlGenerate().generateUrlLinks()
                for url in linkedinJobLinks:
                    file.write(url+ "\n")
            utils.prGreen("✅ Apply urls are created successfully, now the bot will visit those urls.")
        except Exception:
            utils.prRed("❌ Couldn't generate urls, make sure you have editted config file line 25-39")

    def linkJobApply(self) -> None:
        self.generateUrls()
        countApplied = 0
        countJobs = 0
        countBlacklisted = 0
        countAlreadyApplied = 0
        countCannotApply = 0
        countCacheSkipped = 0
        startTime = time.time()
        reachedCap = False
        daily_remaining = self.quota.remaining_applies_today()
        if daily_remaining <= 0:
            utils.prYellow(
                f"🛑 Daily apply quota reached ({config.maxApplicationsPerDay}/day). Skipping."
            )
            return
        if config.maxApplicationsPerRun:
            config.maxApplicationsPerRun = min(
                int(config.maxApplicationsPerRun), daily_remaining
            )

        urlData = utils.getUrlDataFile()

        for url in urlData:        
            self.driver.get(url)
            time.sleep(random.uniform(1, constants.botSpeed))

            # LinkedIn changed DOM — //small may be gone; fall back to counting job cards directly
            try:
                totalJobs = self.driver.find_element(By.XPATH,'//small').text
            except Exception:
                totalJobs = None

            if not totalJobs:
                # Try alternate selectors LinkedIn uses for job count
                for selector in [
                    '.jobs-search-results-list__subtitle',
                    '[class*="jobs-search-results__total-results"]',
                    'h1[class*="results-context"]',
                ]:
                    try:
                        el = self.driver.find_element(By.CSS_SELECTOR, selector)
                        totalJobs = el.text.strip()
                        break
                    except Exception:
                        pass

            if not totalJobs:
                # Last resort: check if any job cards are present on the page
                cards = self.driver.find_elements(By.XPATH, '//li[@data-occludable-job-id]')
                if not cards:
                    urlWords = utils.urlToKeywords(url)
                    lineToWrite = "\n Category: " + urlWords[0] + ", Location: " + urlWords[1] + ", No jobs found for this search criteria. Skipping..."
                    self.displayWriteResults(lineToWrite)
                    continue
                totalJobs = str(len(cards))

            totalPages = utils.jobsToPages(totalJobs)

            urlWords =  utils.urlToKeywords(url)
            lineToWrite = "\n Category: " + urlWords[0] + ", Location: " +urlWords[1] + ", Applying " +str(totalJobs)+ " jobs."
            self.displayWriteResults(lineToWrite)

            for page in range(totalPages):
                currentPageJobs = constants.jobsPerPage * page
                url = url +"&start="+ str(currentPageJobs)
                self.driver.get(url)
                time.sleep(random.uniform(1, constants.botSpeed))

                offersPerPage = self.driver.find_elements(By.XPATH, '//li[@data-occludable-job-id]')
                offerIds = []
                
                # Extract all offer IDs immediately to avoid stale element references
                for offer in offersPerPage:
                    try:
                        offerId = offer.get_attribute("data-occludable-job-id")
                        if offerId:
                            offerIds.append(int(offerId.split(":")[-1]))
                    except Exception as e:
                        if config.displayWarnings:
                            utils.prYellow(f"⚠️ Warning: Could not get offer ID: {str(e)[0:50]}")
                        continue
                
                time.sleep(random.uniform(1, constants.botSpeed))
                
                # Check for "Applied" status by re-finding elements to avoid stale references
                try:
                    offersPerPage = self.driver.find_elements(By.XPATH, '//li[@data-occludable-job-id]')
                    appliedOfferIds = []
                    for offer in offersPerPage:
                        try:
                            if self.element_exists(offer, By.XPATH, ".//*[contains(text(), 'Applied')]"):
                                offerId = offer.get_attribute("data-occludable-job-id")
                                if offerId:
                                    appliedOfferIds.append(int(offerId.split(":")[-1]))
                        except Exception:
                            continue
                    # Remove already applied jobs from the list
                    offerIds = [jobId for jobId in offerIds if jobId not in appliedOfferIds]
                    for applied_id in appliedOfferIds:
                        self.quota.activity.record_job(applied_id, "already_applied")
                except Exception as e:
                    if config.displayWarnings:
                        utils.prYellow(f"⚠️ Warning: Could not check applied status: {str(e)[0:50]}")

                fresh_offer_ids = []
                for job_id in offerIds:
                    if self.quota.activity.should_skip_job(job_id):
                        countCacheSkipped += 1
                    else:
                        fresh_offer_ids.append(job_id)
                offerIds = fresh_offer_ids

                for jobID in offerIds:
                    offerPage = 'https://www.linkedin.com/jobs/view/' + str(jobID)
                    if self.quota.activity.should_skip_job(jobID):
                        countAlreadyApplied += 1
                        continue
                    self.driver.get(offerPage)
                    time.sleep(random.uniform(1, constants.botSpeed))

                    countJobs += 1

                    jobProperties = self.getJobProperties(countJobs)
                    if "blacklisted" in jobProperties: 
                        countBlacklisted += 1
                        self.quota.activity.record_job(jobID, "blacklisted")
                        lineToWrite = jobProperties + " | " + "* 🤬 Blacklisted Job, skipped!: " +str(offerPage)
                        self.displayWriteResults(lineToWrite)
                    
                    else :                    
                        easyApplybutton = self.easyApplyButton()

                        if easyApplybutton is not None:
                            self.driver.execute_script(
                                "arguments[0].click();", easyApplybutton
                            )
                            time.sleep(random.uniform(2, constants.botSpeed + 1))

                            try:
                                result = self.complete_easy_apply(
                                    offerPage, dry_run=config.dryRun
                                )
                                lineToWrite = jobProperties + " | " + result
                                self.displayWriteResults(lineToWrite)
                                if "DRY RUN" in result or "Just Applied" in result:
                                    countApplied += 1
                                    if "Just Applied" in result:
                                        self.quota.record_apply()
                                        self.quota.activity.record_job(jobID, "applied")
                                    elif "DRY RUN" in result:
                                        self.quota.activity.record_job(jobID, "dry_run")
                                    if (
                                        config.maxApplicationsPerRun
                                        and countApplied >= config.maxApplicationsPerRun
                                    ):
                                        reachedCap = True
                            except Exception as ex:
                                countCannotApply += 1
                                self.quota.activity.record_job(jobID, "failed")
                                lineToWrite = (
                                    jobProperties
                                    + " | "
                                    + "* 🥵 Cannot apply to this Job! "
                                    + str(offerPage)
                                    + f" ({ex})"
                                )
                                self.displayWriteResults(lineToWrite)
                        else:
                            countAlreadyApplied += 1
                            self.quota.activity.record_job(jobID, "already_applied")
                            lineToWrite = jobProperties + " | " + "* ⏭️ No Easy Apply (applied/external/skip): " + str(offerPage)
                            self.displayWriteResults(lineToWrite)

                    if reachedCap:
                        break
                if reachedCap:
                    break
            if reachedCap:
                break

            utils.prYellow("Category: " + urlWords[0] + "," +urlWords[1]+ " applied: " + str(countApplied) +
                  " jobs out of " + str(countJobs) + ".")
        
        if reachedCap:
            utils.prYellow("🛑 Reached max applications per run limit (" + str(config.maxApplicationsPerRun) + "). Stopping.")
        if countCacheSkipped:
            utils.prYellow(
                f"⏭️ Skipped {countCacheSkipped} job(s) from activity cache (no page visit)."
            )
        durationSec = time.time() - startTime
        utils.printSessionSummary(
            countJobs, countApplied, countBlacklisted, countAlreadyApplied, countCannotApply, durationSec
        )
        utils.donate()

    def chooseResume(self) -> None:
        try:
            self.driver.find_element(
                By.CLASS_NAME, "jobs-document-upload__title--is-required")
            resumes = self.driver.find_elements(
                By.XPATH, "//div[contains(@class, 'ui-attachment--pdf')]")
            if (len(resumes) == 1 and resumes[0].get_attribute("aria-label") == "Select this resume"):
                resumes[0].click()
            elif (len(resumes) > 1 and resumes[config.preferredCv-1].get_attribute("aria-label") == "Select this resume"):
                resumes[config.preferredCv-1].click()
            elif (type(len(resumes)) != int):
                utils.prRed(
                    "❌ No resume has been selected please add at least one resume to your Linkedin account.")
        except Exception:
            pass

    def getJobProperties(self, count: int) -> str:
        textToWrite = ""
        jobTitle = ""
        jobLocation = ""

        try:
            jobTitle = self.driver.find_element(By.XPATH, "//h1[contains(@class, 'job-title')]").get_attribute("innerHTML").strip()
            res = [blItem for blItem in config.blackListTitles if (blItem.lower() in jobTitle.lower())]
            if (len(res) > 0):
                jobTitle += "(blacklisted title: " + ' '.join(res) + ")"
        except Exception as e:
            if (config.displayWarnings):
                utils.prYellow("⚠️ Warning in getting jobTitle: " + str(e)[0:50])
            jobTitle = ""

        try:
            time.sleep(5)
            jobDetail = self.driver.find_element(By.XPATH, "//div[contains(@class, 'job-details-jobs')]//div").text.replace("·", "|")
            res = [blItem for blItem in config.blacklistCompanies if (blItem.lower() in jobTitle.lower())]
            if (len(res) > 0):
                jobDetail += "(blacklisted company: " + ' '.join(res) + ")"
        except Exception as e:
            if (config.displayWarnings):
                print(e)
                utils.prYellow("⚠️ Warning in getting jobDetail: " + str(e)[0:100])
            jobDetail = ""

        try:
            jobWorkStatusSpans = self.driver.find_elements(By.XPATH, "//span[contains(@class,'ui-label ui-label--accent-3 text-body-small')]//span[contains(@aria-hidden,'true')]")
            for span in jobWorkStatusSpans:
                jobLocation = jobLocation + " | " + span.text

        except Exception as e:
            if (config.displayWarnings):
                print(e)
                utils.prYellow("⚠️ Warning in getting jobLocation: " + str(e)[0:100])
            jobLocation = ""

        textToWrite = str(count) + " | " + jobTitle +" | " + jobDetail + jobLocation
        return textToWrite

    def easyApplyButton(self) -> Optional[webdriver.remote.webelement.WebElement]:
        time.sleep(random.uniform(1, constants.botSpeed))
        selectors = [
            "//a[contains(@aria-label, 'Easy Apply')]",
            "//button[contains(@aria-label, 'Easy Apply')]",
            "//button[contains(@class, 'jobs-apply-button') and contains(., 'Easy Apply')]",
            "//div[contains(@class,'jobs-apply-button--top-card')]//button[contains(@class, 'jobs-apply-button')]",
            "//a[contains(@class, 'jobs-apply-button') and contains(., 'Easy Apply')]",
        ]
        for selector in selectors:
            try:
                button = self.driver.find_element(By.XPATH, selector)
                if button.is_displayed():
                    return button
            except Exception:
                continue
        return None

    def _easy_apply_root_js(self) -> str:
        return """
        function getEasyApplyRoot() {
          const outlet = document.querySelector('#interop-outlet');
          if (outlet && outlet.shadowRoot) return outlet.shadowRoot;
          return document;
        }
        function walkEasyApply(fn) {
          const root = getEasyApplyRoot();
          fn(root);
          root.querySelectorAll('*').forEach(el => {
            if (el.shadowRoot) {
              el.shadowRoot.querySelectorAll('*').forEach(inner => fn(el.shadowRoot));
              fn(el.shadowRoot);
            }
          });
        }
        """

    def _shadow_find_button_labels(self) -> list[str]:
        script = (
            self._easy_apply_root_js()
            + """
        const labels = [];
        walkEasyApply(root => {
          root.querySelectorAll('button').forEach(btn => {
            const tid = btn.getAttribute('data-testid') || '';
            if (tid.includes('carousel')) return;
            const aria = (btn.getAttribute('aria-label') || '').trim();
            const text = (btn.innerText || '').trim();
            if (!aria && !text) return;
            if (/^(skip to|home|me|for business|messaging)/i.test(aria)) return;
            labels.push(aria || text);
          });
        });
        return labels;
        """
        )
        try:
            return self.driver.execute_script(script) or []
        except Exception:
            return []

    def _shadow_click_button(self, labels: list[str]) -> bool:
        script = (
            self._easy_apply_root_js()
            + """
        const labels = arguments[0].map(l => l.toLowerCase());
        let clicked = false;
        walkEasyApply(root => {
          root.querySelectorAll('button').forEach(btn => {
            if (clicked) return;
            const tid = btn.getAttribute('data-testid') || '';
            if (tid.includes('carousel')) return;
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            const text = (btn.innerText || '').trim().toLowerCase();
            if (/^(skip to|home|me|for business|messaging)/i.test(aria)) return;
            for (const label of labels) {
              if (aria.includes(label) || text === label) {
                btn.click();
                clicked = true;
                return;
              }
            }
          });
        });
        return clicked;
        """
        )
        try:
            return bool(self.driver.execute_script(script, labels))
        except Exception:
            return False

    def _shadow_button_visible(self, labels: list[str]) -> bool:
        script = (
            self._easy_apply_root_js()
            + """
        const labels = arguments[0].map(l => l.toLowerCase());
        let found = false;
        walkEasyApply(root => {
          root.querySelectorAll('button').forEach(btn => {
            if (found) return;
            const tid = btn.getAttribute('data-testid') || '';
            if (tid.includes('carousel')) return;
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            const text = (btn.innerText || '').trim().toLowerCase();
            if (/^(skip to|home|me|for business|messaging)/i.test(aria)) return;
            for (const label of labels) {
              if (aria.includes(label) || text === label) {
                found = true;
                return;
              }
            }
          });
        });
        return found;
        """
        )
        try:
            return bool(self.driver.execute_script(script, labels))
        except Exception:
            return False

    def _wait_for_easy_apply_modal(self, timeout: int = 20) -> bool:
        for _ in range(timeout):
            if self._shadow_button_visible(
                [
                    "submit application",
                    "review your application",
                    "continue to next step",
                    "next",
                ]
            ):
                return True
            time.sleep(1)
        return False

    def _load_additional_questions(self) -> dict:
        try:
            import yaml

            if os.path.exists("additionalQuestions.yaml"):
                with open("additionalQuestions.yaml", "r", encoding="utf-8") as f:
                    return yaml.safe_load(f) or {}
        except Exception:
            pass
        return {}

    def _fill_easy_apply_form_fields(self) -> None:
        self.fillPhoneNumber()
        questions = self._load_additional_questions()
        input_fields = questions.get("inputField", {}) or {}
        radio_fields = questions.get("radio", {}) or {}
        default_radio = getattr(config, "defaultRadioOption", None)

        script = (
            self._easy_apply_root_js()
            + """
        const inputFields = arguments[0];
        const radioFields = arguments[1];
        const defaultRadio = arguments[2];
        let filled = 0;

        function setNativeValue(el, value) {
          const proto = el.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        walkEasyApply(root => {
          function questionForInput(el) {
            const block =
              el.closest('[data-test-form-element]') ||
              el.closest('[data-test-text-entity-list-form-component]') ||
              el.closest('div');
            return ((block && block.innerText) || '').toLowerCase();
          }

          root.querySelectorAll('input, textarea, select').forEach(el => {
            const tag = el.tagName.toLowerCase();
            const type = (el.getAttribute('type') || '').toLowerCase();
            if (['hidden', 'checkbox', 'radio', 'file'].includes(type)) return;

            const question = questionForInput(el);
            const attrs = [
              el.getAttribute('aria-label') || '',
              el.getAttribute('placeholder') || '',
              el.getAttribute('name') || '',
              el.id || '',
            ].join(' ').toLowerCase();
            const fullContext = `${question} ${attrs}`;
            const current = (el.value || '').trim();

            for (const [key, val] of Object.entries(inputFields)) {
              if (fullContext.includes(String(key).toLowerCase())) {
                if (tag === 'select') {
                  for (const opt of el.options) {
                    if (opt.text.toLowerCase().includes(String(val).toLowerCase())) {
                      el.value = opt.value;
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                      filled++;
                      return;
                    }
                  }
                } else {
                  setNativeValue(el, String(val));
                  filled++;
                }
                return;
              }
            }

            if (current) return;

            if (fullContext.includes('year') && fullContext.includes('experience')) {
              const defaultYears = inputFields['Years of experience'] ?? 3;
              setNativeValue(el, String(defaultYears));
              filled++;
              return;
            }

            if (type === 'number' || fullContext.includes('how many')) {
              setNativeValue(el, '0');
              filled++;
            }
          });

          root.querySelectorAll('fieldset, div[data-test-form-element]').forEach(block => {
            const question = (block.innerText || '').toLowerCase();
            if (!question.trim()) return;
            let answer = null;
            for (const [key, val] of Object.entries(radioFields)) {
              if (question.includes(String(key).toLowerCase())) {
                answer = String(val).toLowerCase();
                break;
              }
            }
            if (!answer && defaultRadio) {
              answer = defaultRadio === 1 ? 'yes' : 'no';
            }
            if (!answer) return;
            const radios = block.querySelectorAll('input[type="radio"]');
            if (!radios.length) return;
            for (const radio of radios) {
              const label = block.querySelector(`label[for="${radio.id}"]`);
              const text = ((label && label.innerText) || radio.value || '').toLowerCase();
              const wantsYes = ['yes', 'ja', 'sí', 'si', 'oui'].includes(answer);
              const wantsNo = ['no', 'nee', 'nein', 'non'].includes(answer);
              const isYes = text.includes('yes') || text === 'ja' || text === 'sí' || text === 'si';
              const isNo = text.includes('no') || text === 'nee' || text === 'nein' || text === 'non';
              if ((wantsYes && isYes) || (wantsNo && isNo) || text.includes(answer)) {
                radio.click();
                filled++;
                return;
              }
            }
            if (defaultRadio && radios.length) {
              const idx = Math.min(defaultRadio - 1, radios.length - 1);
              radios[idx].click();
              filled++;
            }
          });
        });
        return filled;
        """
        )
        try:
            self.driver.execute_script(script, input_fields, radio_fields, default_radio)
        except Exception:
            pass

    def _uncheck_follow_company(self) -> None:
        if config.followCompanies is not False:
            return
        script = (
            self._easy_apply_root_js()
            + """
        walkEasyApply(root => {
          root.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            const label = root.querySelector(`label[for="${cb.id}"]`);
            const text = ((label && label.innerText) || '').toLowerCase();
            if (text.includes('follow') && cb.checked) cb.click();
          });
        });
        """
        )
        try:
            self.driver.execute_script(script)
        except Exception:
            pass

    def complete_easy_apply(self, offerPage: str, dry_run: bool = False) -> str:
        """Walk multi-step Easy Apply modal through Next → Review → Submit."""
        if not self._wait_for_easy_apply_modal():
            raise RuntimeError("easy apply modal did not open")

        self.chooseResume()
        self._fill_easy_apply_form_fields()

        for step in range(15):
            if self._shadow_button_visible(["submit application"]):
                if dry_run:
                    return "* 🧪 DRY RUN - Would apply to this job: " + offerPage
                self._uncheck_follow_company()
                if not self._shadow_click_button(["submit application"]):
                    raise RuntimeError("submit button click failed")
                time.sleep(random.uniform(2, constants.botSpeed + 1))
                if self._shadow_button_visible(["submit application"]):
                    self._fill_easy_apply_form_fields()
                    if not self._shadow_click_button(["submit application"]):
                        raise RuntimeError("submit blocked by validation")
                return "* 🥳 Just Applied to this job: " + offerPage

            self._fill_easy_apply_form_fields()
            advanced = False
            for labels in [
                ["review your application"],
                ["continue to next step"],
                ["next"],
            ]:
                if self._shadow_click_button(labels):
                    advanced = True
                    time.sleep(random.uniform(1.5, constants.botSpeed + 1))
                    break

            if not advanced:
                visible = self._shadow_find_button_labels()
                raise RuntimeError(
                    "submit button not reached"
                    + (f" (visible buttons: {visible[:8]})" if visible else "")
                )

        raise RuntimeError("exceeded easy apply step limit")

    def fillPhoneNumber(self) -> None:
        """Fill phone number fields if they exist and are empty"""
        try:
            # Get phone number from config or additionalQuestions.yaml
            phone_number = ""
            
            # Try to get from config.Phone first
            if hasattr(config, 'Phone') and config.Phone and config.Phone.strip():
                phone_number = config.Phone.strip()
            else:
                # Try to read from additionalQuestions.yaml if available
                try:
                    import yaml
                    if os.path.exists('additionalQuestions.yaml'):
                        with open('additionalQuestions.yaml', 'r', encoding='utf-8') as f:
                            questions = yaml.safe_load(f)
                            if questions and 'inputField' in questions:
                                phone_number = questions['inputField'].get('Phone Number', '').strip()
                except Exception:
                    pass
            
            if not phone_number:
                return  # No phone number configured, skip filling
            
            # Try multiple selectors to find phone number input fields
            phone_selectors = [
                "input[type='tel']",
                "input[name*='phone']",
                "input[id*='phone']",
                "input[aria-label*='phone']",
                "input[placeholder*='phone']",
                "input[data-test-single-line-text-input]",
                "input[class*='phone']"
            ]
            
            phone_filled = False
            
            # Also try XPath selectors for case-insensitive matching
            xpath_selectors = [
                "//input[contains(translate(@name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'phone')]",
                "//input[contains(translate(@id, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'phone')]",
                "//input[contains(translate(@aria-label, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'phone')]",
                "//input[contains(translate(@placeholder, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'phone')]"
            ]
            
            # Try CSS selectors first
            for selector in phone_selectors:
                try:
                    phone_inputs = self.driver.find_elements(By.CSS_SELECTOR, selector)
                    for phone_input in phone_inputs:
                        try:
                            # Check if field is visible and empty
                            if phone_input.is_displayed():
                                current_value = phone_input.get_attribute("value") or ""
                                if current_value == "":
                                    phone_input.clear()
                                    phone_input.send_keys(phone_number)
                                    time.sleep(0.5)
                                    phone_filled = True
                                    if config.displayWarnings:
                                        utils.prYellow(f"✅ Filled phone number: {phone_number}")
                                    break
                        except Exception:
                            continue
                    if phone_filled:
                        break
                except Exception:
                    continue
            
            # Try XPath selectors if CSS didn't work
            if not phone_filled:
                for xpath in xpath_selectors:
                    try:
                        phone_inputs = self.driver.find_elements(By.XPATH, xpath)
                        for phone_input in phone_inputs:
                            try:
                                if phone_input.is_displayed():
                                    current_value = phone_input.get_attribute("value") or ""
                                    if current_value == "":
                                        phone_input.clear()
                                        phone_input.send_keys(phone_number)
                                        time.sleep(0.5)
                                        phone_filled = True
                                        if config.displayWarnings:
                                            utils.prYellow(f"✅ Filled phone number: {phone_number}")
                                        break
                            except Exception:
                                continue
                        if phone_filled:
                            break
                    except Exception:
                        continue
                
        except Exception as e:
            if config.displayWarnings:
                utils.prYellow(f"⚠️ Warning: Error in fillPhoneNumber: {str(e)[0:50]}")

    def applyProcess(self, percentage: int, offerPage: str) -> str:
        applyPages = math.floor(100 / percentage) - 2 
        result = ""
        for pages in range(applyPages):
            # Fill phone number before continuing to next step
            self.fillPhoneNumber()
            self.driver.find_element(By.CSS_SELECTOR, "button[aria-label='Continue to next step']").click()
            time.sleep(random.uniform(1, constants.botSpeed))

        # Fill phone number before review
        self.fillPhoneNumber()

        if config.dryRun:
            # In dry-run mode, navigate up to this point but do not submit.
            result = "* 🧪 DRY RUN - Would apply to this job: " + str(offerPage)
            return result

        self.driver.find_element( By.CSS_SELECTOR, "button[aria-label='Review your application']").click()
        time.sleep(random.uniform(1, constants.botSpeed))

        if config.followCompanies is False:
            try:
                self.driver.find_element(By.CSS_SELECTOR, "label[for='follow-company-checkbox']").click()
            except Exception:
                pass

        self.driver.find_element(By.CSS_SELECTOR, "button[aria-label='Submit application']").click()
        time.sleep(random.uniform(1, constants.botSpeed))

        result = "* 🥳 Just Applied to this job: " + str(offerPage)

        return result

    def displayWriteResults(self, lineToWrite: str) -> None:
        try:
            print(lineToWrite)
            utils.writeResults(lineToWrite)
        except Exception as e:
            utils.prRed("❌ Error in DisplayWriteResults: " +str(e))

    def element_exists(self, parent: webdriver.remote.webelement.WebElement, by: str, selector: str) -> bool:
        return len(parent.find_elements(by, selector)) > 0


def main() -> None:
    start = time.time()
    bot = Linkedin()
    bot.linkJobApply()
    end = time.time()
    utils.prYellow("---Took: " + str(round((time.time() - start)/60)) + " minute(s).")


if __name__ == "__main__":
    main()
