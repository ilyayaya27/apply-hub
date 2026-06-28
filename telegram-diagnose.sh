#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TG="$ROOT/platforms/telegram"
cd "$TG"
mkdir -p "$TG/logs"
exec bun run diagnose "$@"
