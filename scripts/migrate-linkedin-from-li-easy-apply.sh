#!/usr/bin/env bash
# Перенос data/cookies/secrets из ~/Documents/li-easy-apply → platforms/linkedin
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OLD="${1:-$HOME/Documents/li-easy-apply}"
NEW="$ROOT/platforms/linkedin"

if [[ ! -d "$OLD" ]]; then
  echo "Нет $OLD — укажи путь: $0 /path/to/li-easy-apply"
  exit 1
fi

mkdir -p "$NEW/data" "$NEW/cookies" "$NEW/logs"

if [[ -d "$OLD/data" ]]; then
  echo "Копирую data/..."
  cp -a "$OLD/data/." "$NEW/data/"
fi
if [[ -d "$OLD/cookies" ]]; then
  echo "Копирую cookies/..."
  cp -a "$OLD/cookies/." "$NEW/cookies/"
fi
if [[ -f "$OLD/config_secrets.py" ]]; then
  cp "$OLD/config_secrets.py" "$NEW/"
else
  echo "WARN: нет config_secrets.py в $OLD"
fi

echo "Готово. Дальше:"
echo "  cd $ROOT && pip install -e '.[linkedin]'"
echo "  systemctl --user disable --now li-worker.service 2>/dev/null || true"
echo "  ./install-automation.sh linkedin"
