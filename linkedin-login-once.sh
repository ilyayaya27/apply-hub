#!/usr/bin/env bash
# Одноразовый логин LinkedIn (2FA) — сохраняет сессию в platforms/linkedin/data/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LI="$ROOT/platforms/linkedin"
cd "$LI"

if [[ ! -f "$LI/config_secrets.py" ]]; then
  echo "❌ Сначала: cp $LI/config_secrets.py.example $LI/config_secrets.py"
  exit 1
fi

export DISPLAY="${DISPLAY:-:0}"
exec "$ROOT/.venv/bin/python" "$LI/login-once.py"
