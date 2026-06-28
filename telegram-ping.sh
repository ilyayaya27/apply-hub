#!/usr/bin/env bash
# Проверка Telegram-сессии и «Избранного» (platforms/telegram).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TG="$ROOT/platforms/telegram"
cd "$TG"

if [[ ! -f "$TG/.env" ]]; then
  echo "❌ Нет $TG/.env — cp .env.example .env"
  exit 1
fi

exec bun run ping "$@"
