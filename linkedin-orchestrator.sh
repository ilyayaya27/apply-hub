#!/usr/bin/env bash
# Один цикл LinkedIn: apply + connect в рамках квот (platforms/linkedin).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LI="$ROOT/platforms/linkedin"
cd "$LI"

ORCH_LOCK="$ROOT/.linkedin-orchestrator.lock"
exec 8>>"$ORCH_LOCK"
if ! flock -n 8; then
  echo "⏭️ LinkedIn orchestrator already running, skip"
  exit 0
fi

if [[ ! -f "$LI/config_secrets.py" ]]; then
  echo "❌ Нет $LI/config_secrets.py (cp config_secrets.py.example config_secrets.py)"
  exit 1
fi

mkdir -p "$LI/data" "$LI/cookies" "$LI/logs"

export DISPLAY="${DISPLAY:-:0}"
exec "$ROOT/.venv/bin/python" -u "$LI/orchestrator.py" >>"$LI/logs/orchestrator.log" 2>&1
