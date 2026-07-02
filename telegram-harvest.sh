#!/usr/bin/env bash
# Сбор вакансий из Telegram-каналов → logs/harvest-latest.json (platforms/telegram).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TG="$ROOT/platforms/telegram"
CREDS="$ROOT/platforms/apply/credentials.env"

if [[ -f "$CREDS" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$CREDS"
  set +a
fi

cd "$TG"

if [[ ! -f "$TG/.env" ]]; then
  echo "❌ Нет $TG/.env — cp .env.example .env и заполни TELEGRAM_API_*"
  exit 1
fi
if [[ ! -f "$TG/src/config/channels.json" ]]; then
  echo "❌ Нет channels.json — cp src/config/channels.example.json src/config/channels.json"
  exit 1
fi

mkdir -p "$TG/logs"

# systemd services don't have ~/.bun/bin in PATH
BUN="$(command -v bun || echo "$HOME/.bun/bin/bun")"
if [[ ! -x "$BUN" ]]; then
  echo "❌ bun не найден ни в PATH, ни в ~/.bun/bin"
  exit 1
fi
exec "$BUN" run harvest "$@"
