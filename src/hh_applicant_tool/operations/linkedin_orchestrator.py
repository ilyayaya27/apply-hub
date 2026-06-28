from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import TYPE_CHECKING

from ..main import BaseNamespace, BaseOperation

if TYPE_CHECKING:
    from ..main import HHApplicantTool

LINKEDIN_ROOT = Path(__file__).resolve().parents[3] / "platforms" / "linkedin"


class Namespace(BaseNamespace):
    pass


class Operation(BaseOperation):
    """LinkedIn Easy Apply: один цикл оркестратора (apply + connect по квотам)."""

    def setup_parser(self, parser: argparse.ArgumentParser) -> None:
        pass

    def run(
        self,
        applicant_tool: HHApplicantTool,
        args: BaseNamespace,
    ) -> None:
        if not (LINKEDIN_ROOT / "config_secrets.py").is_file():
            raise SystemExit(
                f"Нет {LINKEDIN_ROOT}/config_secrets.py — "
                "скопируй из config_secrets.py.example"
            )
        os.chdir(LINKEDIN_ROOT)
        if str(LINKEDIN_ROOT) not in sys.path:
            sys.path.insert(0, str(LINKEDIN_ROOT))
        from orchestrator import main

        main()
