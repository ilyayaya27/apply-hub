#!/usr/bin/env bash
# Перенос .env / сессии / channels из ~/Documents/tg-job-harvest → platforms/telegram
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OLD="${1:-$HOME/Documents/tg-job-harvest}"
NEW="$ROOT/platforms/telegram"

if [[ ! -d "$OLD" ]]; then
  echo "Нет $OLD — укажи путь: $0 /path/to/tg-job-harvest"
  exit 1
fi

mkdir -p "$NEW/logs"

for f in .env .telegram_session .seen_store.json; do
  if [[ -f "$OLD/$f" ]]; then
    echo "Копирую $f..."
    cp -a "$OLD/$f" "$NEW/"
  fi
done

if [[ -f "$OLD/src/config/channels.json" ]]; then
  echo "Копирую channels.json..."
  cp -a "$OLD/src/config/channels.json" "$NEW/src/config/"
elif [[ ! -f "$NEW/src/config/channels.json" ]]; then
  echo "WARN: нет channels.json — cp src/config/channels.example.json src/config/channels.json"
fi

echo "Готово. Дальше:"
echo "  cd $NEW && bun install"
echo "  cd $ROOT && ./telegram-ping.sh"
echo "  ./telegram-harvest.sh"
