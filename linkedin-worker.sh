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

log_activity_stats() {
  "$ROOT/.venv/bin/python" - <<'PY'
import json, os, sys
from collections import Counter
from datetime import datetime, timezone, timedelta

path = os.path.join(os.path.dirname(__file__), "platforms/linkedin/data/activity.json")
if not os.path.exists(path):
    print("  stats: no activity.json yet")
    sys.exit(0)

with open(path) as f:
    d = json.load(f)

jobs = d.get("jobs", {})
connects = d.get("connects", {})

jc = Counter(v.get("status") for v in jobs.values())
cc = Counter(v.get("status") for v in connects.values())

today = datetime.now(timezone.utc).date().isoformat()
yesterday = (datetime.now(timezone.utc).date() - timedelta(days=1)).isoformat()

today_jobs = sum(1 for v in jobs.values() if (v.get("updated_at") or "")[:10] == today and v.get("status") == "applied")
today_connects = sum(1 for v in connects.values() if (v.get("updated_at") or "")[:10] == today and v.get("status") in ("connected","pending"))

print(f"  total: {jc.get('applied',0)} applied, {jc.get('failed',0)} failed | connects: {cc.get('connected',0)}+{cc.get('pending',0)} pending")
print(f"  today: {today_jobs} jobs applied, {today_connects} connects sent")
PY
}

log "LinkedIn orchestrator worker started"

while true; do
  if in_work_hours; then
    log "=== cycle start ==="
    if "$ROOT/linkedin-orchestrator.sh"; then
      log "=== cycle end OK ==="
    else
      log "WARN: orchestrator failed (см. platforms/linkedin/logs/orchestrator.log)"
    fi
    log_activity_stats 2>/dev/null | while IFS= read -r line; do log "$line"; done
    sleep "$(cycle_sleep_seconds)"
  else
    log "Outside work hours, sleeping 10 min"
    sleep 600
  fi
done
