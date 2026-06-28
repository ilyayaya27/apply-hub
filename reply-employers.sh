#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/hh-common.sh
source "$ROOT/lib/hh-common.sh"

exec $PY -m hh_applicant_tool reply-employers --use-ai "$@"
