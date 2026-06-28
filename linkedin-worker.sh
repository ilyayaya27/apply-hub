#!/usr/bin/env bash
# LinkedIn worker: циклы apply+connect по квотам (9–20 по config.py).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LI="$ROOT/platforms/linkedin"
LOG="$LI/logs/worker.log"
LOCK="$ROOT/.linkedin-worker.lock"

mkdir -p "$LI/logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

read_config_int() {
  "$ROOT/.venv/bin/python" - <<PY
import sys
sys.path.insert(0, "$LI")
import config
print(int(getattr(config, "$1", $2)))
PY
}

in_work_hours() {
  local h start end
  h=$(date +%H | sed 's/^0//')
  start=$(read_config_int workHourStart 9)
  end=$(read_config_int workHourEnd 20)
  (( h >= start && h < end ))
}

cycle_sleep_seconds() {
  local mins
  mins=$(read_config_int orchestratorCycleMinutes 120)
  echo $((mins * 60))
}

exec 9>"$LOCK"
if ! flock -n 9; then
  log "Another linkedin-worker instance is running, exit"
  exit 0
fi

log "LinkedIn orchestrator worker started"

while true; do
  if in_work_hours; then
    log "=== cycle start ==="
    if "$ROOT/linkedin-orchestrator.sh"; then
      log "=== cycle end OK ==="
    else
      log "WARN: orchestrator failed (см. platforms/linkedin/logs/orchestrator.log)"
    fi
    sleep "$(cycle_sleep_seconds)"
  else
    log "Outside work hours, sleeping 10 min"
    sleep 600
  fi
done
