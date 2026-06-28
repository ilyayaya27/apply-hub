#!/usr/bin/env python3
import time

from linkedin import Linkedin

JOB = "https://www.linkedin.com/jobs/view/4431268550"


def main() -> None:
    bot = Linkedin()
    try:
        bot.driver.get(JOB)
        time.sleep(5)
        el = bot.easyApplyButton()
        if not el:
            print("no easy apply")
            return
        bot.driver.execute_script("arguments[0].click();", el)
        time.sleep(3)
        result = bot.complete_easy_apply(JOB, dry_run=True)
        print(result)
        bot.driver.save_screenshot("logs/debug-modal.png")
    finally:
        bot.driver.quit()


if __name__ == "__main__":
    main()
