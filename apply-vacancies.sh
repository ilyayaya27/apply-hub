#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/hh-common.sh
source "$ROOT/lib/hh-common.sh"

# По умолчанию — рекомендованные hh.ru под каждое опубликованное резюме (similar_vacancies).
# Так в разы больше новых вакансий, чем при исчерпанном --search.
# Ручной поиск по названию (узкий, для экспериментов): HH_USE_SEARCH=1 ./apply-vacancies.sh --dry-run
SEARCH='(NAME:(frontend OR "frontend developer" OR react OR typescript OR "next.js")) AND NOT NAME:(junior OR intern OR стажер OR senior OR lead OR "team lead" OR fullstack OR backend OR QA)'

EXTRA_ARGS=("$@")

ARGS=(
  -L "$ROOT/letter.txt"
  -f
  --no-ai
  --apply-delay-min 18
  --apply-delay-max 50
)

if [[ "${HH_USE_SEARCH:-}" == 1 ]]; then
  ARGS+=(
    --search "$SEARCH"
    --experience between3And6
  )
fi

exec $TOOL apply-vacancies "${ARGS[@]}" "${EXTRA_ARGS[@]}"
