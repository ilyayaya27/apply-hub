#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/hh-common.sh
source "$ROOT/lib/hh-common.sh"

REPLY='Добрый день! Спасибо за сообщение. Готов ответить на ваши вопросы. Telegram: @ilyasilkin27'

exec $PY -m hh_applicant_tool reply-employers \
  --no-ai \
  --reply-message "$REPLY" \
  "$@"
