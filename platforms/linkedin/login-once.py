#!/usr/bin/env python3
"""Один раз залогиниться в LinkedIn вручную (2FA/captcha), сохранить cookies."""
import hashlib
import os
import pickle
import sys
import time

import config
import utils
from selenium import webdriver
from selenium.webdriver.common.by import By

WAIT_SEC = 180


def cookie_path() -> str:
    digest = hashlib.md5(config.email.encode("utf-8")).hexdigest()
    return os.path.join(os.getcwd(), "cookies", f"{digest}.pkl")


def logged_in(driver) -> bool:
    driver.get("https://www.linkedin.com/feed/")
    time.sleep(3)
    url = driver.current_url
    if any(x in url for x in ("login", "checkpoint", "authwall")):
        return False
    try:
        driver.find_element(
            By.CSS_SELECTOR,
            "button.global-nav__primary-link-me-menu-trigger, img.global-nav__me-photo",
        )
        return True
    except Exception:
        return "/feed" in url


def main() -> int:
    if not config.email or not config.password:
        print("Заполни config_secrets.py")
        return 1

    os.makedirs("cookies", exist_ok=True)
    print(f"Откроется Chromium. Залогинься в LinkedIn (2FA если спросит). Жду до {WAIT_SEC} сек…")

    driver = webdriver.Chrome(options=utils.chromeBrowserOptions())
    try:
        driver.get("https://www.linkedin.com/login")
        time.sleep(2)
        try:
            driver.find_element(By.ID, "username").send_keys(config.email)
            driver.find_element(By.ID, "password").send_keys(config.password)
            driver.find_element(By.CSS_SELECTOR, "button[type='submit']").click()
        except Exception:
            print("Автозаполнение не сработало — введи логин/пароль руками в окне браузера.")

        deadline = time.time() + WAIT_SEC
        while time.time() < deadline:
            if logged_in(driver):
                with open(cookie_path(), "wb") as f:
                    pickle.dump(driver.get_cookies(), f)
                print(f"✅ Сессия сохранена: {cookie_path()}")
                return 0
            time.sleep(5)

        print("❌ Не дождались входа. Попробуй ещё раз: ./login-once.sh")
        return 1
    finally:
        driver.quit()


if __name__ == "__main__":
    sys.exit(main())
