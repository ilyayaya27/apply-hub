#!/usr/bin/env bash
# Непрерывный воркер: отклики + ответы в чатах + автоподнятие резюме (8:00–21:00).
# Запуск: ./hh-worker.sh   или  systemctl --user start hh-worker
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/hh-common.sh
source "$ROOT/lib/hh-common.sh"
LOG="$ROOT/logs/worker.log"
LOCK="$ROOT/.hh-worker.lock"
LAST_LIFT_FILE="$ROOT/.last-resume-lift"

WORK_HOUR_START=8
WORK_HOUR_END=21
RESUME_LIFT_INTERVAL_SEC=$((4 * 3600))
CYCLE_SLEEP_MIN=900   # 15 мин между циклами откликов
CYCLE_SLEEP_MAX=1800  # 30 мин

mkdir -p "$ROOT/logs"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

in_work_hours() {
  local h
  h=$(date +%H | sed 's/^0//')
  (( h >= WORK_HOUR_START && h < WORK_HOUR_END ))
}

should_lift_resume() {
  if [[ ! -f "$LAST_LIFT_FILE" ]]; then
    return 0
  fi
  local last now
  last=$(cat "$LAST_LIFT_FILE")
  now=$(date +%s)
  (( now - last >= RESUME_LIFT_INTERVAL_SEC ))
}

lift_resume() {
  log "update-resumes (автоподнятие)"
  if $PY -m hh_applicant_tool update-resumes >>"$LOG" 2>&1; then
    date +%s >"$LAST_LIFT_FILE"
  else
    log "WARN: update-resumes failed"
  fi
}

run_cycle() {
  log "=== cycle start ==="

  $PY -m hh_applicant_tool refresh-token >>"$LOG" 2>&1 || log "WARN: refresh-token failed"

  if should_lift_resume; then
    lift_resume
  fi

  log "reply-employers"
  "$ROOT/reply-employers.sh" >>"$LOG" 2>&1 || log "WARN: reply-employers failed"

  log "apply-vacancies"
  "$ROOT/apply-vacancies.sh" >>"$LOG" 2>&1 || log "WARN: apply-vacancies finished with error or limit"

  log "=== cycle end ==="
}

exec 9>"$LOCK"
if ! flock -n 9; then
  log "Another worker instance is running, exit"
  exit 0
fi

log "HH worker started (hours ${WORK_HOUR_START}:00–${WORK_HOUR_END}:00)"

while true; do
  if in_work_hours; then
    run_cycle
    sleep_sec=$((CYCLE_SLEEP_MIN + RANDOM % (CYCLE_SLEEP_MAX - CYCLE_SLEEP_MIN + 1)))
    log "Sleep ${sleep_sec}s before next cycle"
    sleep "$sleep_sec"
  else
    log "Outside work hours, sleeping 10 min"
    sleep 600
  fi
done
