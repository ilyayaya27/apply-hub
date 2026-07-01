#!/usr/bin/env bash
# Ежедневная сводка по всем платформам поиска работы.
# Запуск: ./scripts/daily-digest.sh
# Отправляет в Telegram если задан TELEGRAM_NOTIFY_BOT_TOKEN + TELEGRAM_NOTIFY_CHAT_ID.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TODAY=$(date '+%Y-%m-%d')
LOG="$ROOT/logs/digest.log"
mkdir -p "$ROOT/logs"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# Загружаем credentials если есть
[[ -f "$ROOT/platforms/apply/credentials.env" ]] && source "$ROOT/platforms/apply/credentials.env"

# ── HH.ru ──────────────────────────────────────────────────────────────────────
HH_LOG="$ROOT/logs/worker.log"
hh_applied_today=0
hh_replies_today=0
hh_total=0
if [[ -f "$HH_LOG" ]]; then
  hh_applied_today=$(grep -c "Отправили отклик" "$HH_LOG" 2>/dev/null || true)
  hh_replies_today=$(grep -c "📨 Отправлено для" "$HH_LOG" 2>/dev/null || true)
  hh_total=$hh_applied_today
fi

# ── LinkedIn ───────────────────────────────────────────────────────────────────
li_applied_total=0; li_connects_total=0; li_today_jobs=0; li_today_connects=0
LI_ACTIVITY="$ROOT/platforms/linkedin/data/activity.json"
if [[ -f "$LI_ACTIVITY" ]]; then
  _li=$("$ROOT/.venv/bin/python" - "$LI_ACTIVITY" <<'PY'
import json, sys
from collections import Counter
from datetime import datetime, timezone
with open(sys.argv[1]) as f: d = json.load(f)
jobs = d.get("jobs", {}); connects = d.get("connects", {})
jc = Counter(v.get("status") for v in jobs.values())
cc = Counter(v.get("status") for v in connects.values())
today = datetime.now(timezone.utc).date().isoformat()
tj = sum(1 for v in jobs.values() if (v.get("updated_at",""))[:10]==today and v.get("status")=="applied")
tc = sum(1 for v in connects.values() if (v.get("updated_at",""))[:10]==today and v.get("status") in ("connected","pending"))
print(jc.get("applied",0), cc.get("connected",0)+cc.get("pending",0), tj, tc)
PY
  )
  read -r li_applied_total li_connects_total li_today_jobs li_today_connects <<< "$_li"
fi

# ── rvc.global ─────────────────────────────────────────────────────────────────
rvc_total=0
RVC_STATE="$ROOT/platforms/apply/data/rvc-global-state.json"
if [[ -f "$RVC_STATE" ]]; then
  rvc_total=$("$ROOT/.venv/bin/python" -c "
import json
d=json.load(open('$RVC_STATE'))
print(len(d.get('applied',{})))
" 2>/dev/null || echo 0)
fi

# ── rvc.global токен expiry ────────────────────────────────────────────────────
token_warn=""
if [[ -n "${RVC_GLOBAL_TOKEN:-}" ]]; then
  exp=$("$ROOT/.venv/bin/python" -c "
import base64, json, sys
try:
    parts = '$RVC_GLOBAL_TOKEN'.split('.')
    pad = parts[1] + '=='*((4-len(parts[1])%4)%4)
    pl = json.loads(base64.urlsafe_b64decode(pad))
    import time; days = (pl['exp'] - time.time()) / 86400
    print(f'{days:.0f}')
except: print('?')
" 2>/dev/null)
  if [[ "$exp" != "?" ]] && (( exp < 7 )); then
    token_warn="⚠️ rvc.global токен истекает через ${exp} дн — обнови RVC_GLOBAL_TOKEN"
  fi
fi

# ── Форматируем дайджест ───────────────────────────────────────────────────────
DIGEST="$(cat <<EOF
📊 apply-hub / $TODAY

🟠 HH.ru
  Откликов всего: $hh_total
  Ответов в чатах: $hh_replies_today

🔵 LinkedIn
  Easy Apply всего: $li_applied_total | сегодня: $li_today_jobs
  Коннекты всего: $li_connects_total | сегодня: $li_today_connects

🟣 rvc.global career-сайты
  Применено всего: $rvc_total

EOF
)"

[[ -n "$token_warn" ]] && DIGEST+="$token_warn"$'\n'

log "$DIGEST"

# ── Отправить в Telegram ───────────────────────────────────────────────────────
BOT_TOKEN="${TELEGRAM_NOTIFY_BOT_TOKEN:-}"
CHAT_ID="${TELEGRAM_NOTIFY_CHAT_ID:-}"

if [[ -n "$BOT_TOKEN" && -n "$CHAT_ID" ]]; then
  curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" \
    -d "text=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$DIGEST")" \
    -d "disable_web_page_preview=true" \
    > /dev/null && log "Telegram: sent OK" || log "Telegram: send failed"
else
  log "Telegram: нет BOT_TOKEN/CHAT_ID — вывод только в лог"
fi
