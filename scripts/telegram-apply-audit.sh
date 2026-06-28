#!/usr/bin/env bash
# Краткий аудит очереди apply + последний harvest (human digest, external feed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPLY="$ROOT/platforms/apply"
CREDS="$APPLY/credentials.env"

if [[ -f "$CREDS" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$CREDS"
  set +a
fi

HARVEST="${1:-$ROOT/platforms/telegram/logs/harvest-latest.json}"
exec node "$APPLY/cli.js" audit "$HARVEST"
