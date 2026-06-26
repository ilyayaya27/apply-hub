# Этот модуль можно использовать как образец для других
from __future__ import annotations

import argparse
import logging
import re
from typing import TYPE_CHECKING

from ..main import BaseNamespace, BaseOperation

if TYPE_CHECKING:
    from ..main import HHApplicantTool


logger = logging.getLogger(__package__)


class Namespace(BaseNamespace):
    pass


class Operation(BaseOperation):
    """Проверка браузерной сессии, полученной при авторизации"""

    __aliases__: list[str] = []

    def setup_parser(self, parser: argparse.ArgumentParser) -> None:
        # parser
        ...

    def run(self, tool: HHApplicantTool, args: BaseNamespace) -> None:
        r = tool.session.get("https://hh.ru")

        if m := re.search(r'^\s+login: "([^"]+)', r.text, re.MULTILINE):
            print("✅ Браузерная (веб) сессия активна, вы вошли как", m.group(1))
        else:
            logger.warning(
                "Браузерная (cookie) ВЕБ-сессия не активна. Она нужна только для "
                "решения тестов и капчи и ЖИВЁТ ОТДЕЛЬНО от API-токена. "
                "Если whoami/apply работают — с авторизацией всё ок. "
                "Обновить веб-сессию: `authorize`."
            )
