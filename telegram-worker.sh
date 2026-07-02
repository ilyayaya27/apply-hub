#!/usr/bin/env bash
# Telegram worker: harvest → apply batch (внутри harvest при AUTO_APPLY) → digest notify.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TG="$ROOT/platforms/telegram"
APPLY="$ROOT/platforms/apply"
LOG="$TG/logs/worker.log"
LOCK="$ROOT/.telegram-worker.lock"
CREDS="$APPLY/credentials.env"

mkdir -p "$TG/logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

if [[ -f "$CREDS" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$CREDS"
  set +a
  log "Loaded apply credentials from $CREDS"
fi

in_work_hours() {
  local h start end
  h=$(date +%H | sed 's/^0//')
  start="${TELEGRAM_WORK_HOUR_START:-9}"
  end="${TELEGRAM_WORK_HOUR_END:-20}"
  (( h >= start && h < end ))
}

cycle_sleep_seconds() {
  local mins="${TELEGRAM_CYCLE_MINUTES:-120}"
  echo $((mins * 60))
}

exec 9>"$LOCK"
if ! flock -n 9; then
  log "Another telegram-worker instance is running, exit"
  exit 0
fi

log "Telegram harvest worker started"

while true; do
  if in_work_hours; then
    log "=== cycle start ==="
    if "$ROOT/telegram-harvest.sh"; then
      log "=== harvest OK ==="
      if node "$APPLY/cli.js" triage >>"$LOG" 2>&1; then
        log "Triage OK (needs_human разобрана)"
      else
        log "WARN: triage failed (см. $LOG)"
      fi
      if node "$APPLY/cli.js" notify-harvest-digest 2>>"$LOG"; then
        log "Human digest notify sent (or skipped)"
      else
        log "WARN: notify-harvest-digest failed (см. $LOG)"
      fi
    else
      log "WARN: harvest failed (см. $TG/logs)"
    fi
    sleep "$(cycle_sleep_seconds)"
  else
    log "Outside work hours, sleeping 10 min"
    sleep 600
  fi
done
