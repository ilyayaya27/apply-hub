#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/hh-common.sh
source "$ROOT/lib/hh-common.sh"

# Поиск: middle frontend, без junior/senior/fullstack в названии
SEARCH='(NAME:(frontend OR "frontend developer" OR react OR typescript OR "next.js")) AND NOT NAME:(junior OR intern OR стажер OR senior OR lead OR "team lead" OR fullstack OR backend OR QA)'

# Regex по названию + описанию — только однозначный чужой стек (vue/angular НЕ баним)
EXCLUDED='golang|\bgo\b|laravel|symfony|\bphp\b|wordpress|drupal|1с|bitrix|битрикс|web3|crypto|blockchain|хакатон|конкурс|полиграф|open\s*space|опенспейс'

EXTRA_ARGS=("$@")

exec $TOOL apply-vacancies \
  -L "$ROOT/letter.txt" \
  -f \
  --no-ai \
  --search "$SEARCH" \
  --experience between3And6 \
  --excluded-filter "$EXCLUDED" \
  --apply-delay-min 40 \
  --apply-delay-max 120 \
  "${EXTRA_ARGS[@]}"
