#!/usr/bin/env bash
# Непрерывный воркер: отклики + ответы в чатах + автоподнятие резюме (8:00–21:00).
# Запуск: ./hh-worker.sh   или  systemctl --user start hh-worker
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/ensure-venv.sh
source "$ROOT/lib/ensure-venv.sh"
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

refresh_and_reply() {
  set +e
  $PY -m hh_applicant_tool refresh-token >>"$LOG" 2>&1
  refresh_rc=$?
  set -e
  if (( refresh_rc == 1 )); then
    log "WARN: refresh-token failed"
  fi
  log "reply-employers"
  # Таймаут: 09.07 Groq так рейт-лимитил (429 с ретраями по 20-60с × 5 попыток
  # на чат), что reply-employers съедал весь цикл и apply-vacancies ни разу не
  # запустился за день — 0 новых откликов. Жёсткий потолок защищает основной
  # поток откликов от деградации AI-провайдера.
  # `!`-негация перед if стирала реальный код возврата ($? внутри then всегда
  # был 0/1 от самой `!`, не от timeout) — таймаут (124) никогда не отличался
  # от прочих ошибок в логе. Проверяем через if/else напрямую.
  if timeout 240 "$ROOT/reply-employers.sh" >>"$LOG" 2>&1; then
    rc=0
  else
    rc=$?
  fi
  if (( rc != 0 )); then
    if (( rc == 124 )); then
      log "WARN: reply-employers прерван по таймауту (240с) — вероятно, AI-провайдер лимитит"
    else
      log "WARN: reply-employers failed"
    fi
  fi
}

run_apply_cycle() {
  log "=== apply cycle start ==="
  refresh_and_reply

  if should_lift_resume; then
    lift_resume
  fi

  log "apply-vacancies"
  "$ROOT/apply-vacancies.sh" >>"$LOG" 2>&1 || log "WARN: apply-vacancies finished with error or limit"

  log "=== apply cycle end ==="
}

exec 9>"$LOCK"
if ! flock -w 10 9; then
  log "Another worker instance is running after 10s wait, exit"
  exit 0
fi

log "HH worker started (hours ${WORK_HOUR_START}:00–${WORK_HOUR_END}:00)"

while true; do
  if in_work_hours; then
    run_apply_cycle
    sleep_sec=$((CYCLE_SLEEP_MIN + RANDOM % (CYCLE_SLEEP_MAX - CYCLE_SLEEP_MIN + 1)))
    log "Sleep ${sleep_sec}s before next cycle"
    sleep "$sleep_sec"
  else
    log "Outside work hours — reply-only cycle"
    refresh_and_reply
    log "Outside work hours, sleeping 10 min"
    sleep 600
  fi
done
