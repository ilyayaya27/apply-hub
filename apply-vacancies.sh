#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib/hh-common.sh
source "$ROOT/lib/hh-common.sh"

# По умолчанию — рекомендованные hh.ru под каждое опубликованное резюме (similar_vacancies).
# Так в разы больше новых вакансий, чем при исчерпанном --search.
# Ручной поиск по названию: HH_USE_SEARCH=1 ./apply-vacancies.sh --dry-run
# Senior включён: 5+ лет опыта — senior-позиции релевантны
SEARCH='(NAME:(frontend OR "frontend developer" OR react OR typescript OR "next.js" OR senior)) AND NOT NAME:(junior OR intern OR стажер OR lead OR "team lead" OR fullstack OR backend OR QA)'

# similar_vacancies (дефолт-режим) не фильтрует по релевантности вообще — hh.ru
# рекомендует и чистый backend/QA/mobile, если в резюме просто есть слово
# "TypeScript"/"JavaScript". Разбор отказов 14.07 показал: 50% отказов за
# неделю (96/191) — вакансии без единого frontend-сигнала в названии
# (backend/QA/мобильная разработка/дизайн/архитектор/junior-стажёр для
# 5-летнего профиля). Фильтр ниже работает в ОБОИХ режимах (--search и
# similar_vacancies) — это уже готовый механизм в apply_vacancies.py,
# просто не был подключён.
# Разбор чатов 21.07 показал новую волну: 1С/Delphi/Bitrix/PL-SQL/DBA/
# Ruby on Rails/бизнес-аналитик/митапы проходили мимо фильтра (не было ни
# самих слов, ни "разработ" как алиаса без англ. "developer", ни Cyrillic
# С в "С++"/"C#"). Добавлены соответствующие ветки; убран внешний \b в
# конце группы — он ломал совпадение для "C++"/"C#" (токен заканчивается
# символом, а не буквой, так что \b после него никогда не срабатывает).
# ponytail: "python" и подобные голые слова матчатся без границы справа —
# теоретически зацепят редкое "pythonic" в описании, апгрейд — если увидим
# реальный ложный срез.
EXCLUDED_FILTER='\b(backend|back-end|бэкенд|бекенд|тестир\w*|qa[\s-]*(engineer|инженер)|sdet|pentest|пентест|devops|android|ios[\s-]?(developer|разработ\w*)|мобильн\w+\s+разработ\w+|react\s*native|[cс]#|\.net|golang|go[\s-]?(developer|разработ\w*)|rust[\s-]?(developer|разработ\w*)|ruby[\s-]?(developer|разработ\w*|on\s+rails)|php[\s-]?(developer|разработ\w*)|yii\d?\b|python|верстальщик|дизайнер|архитектор|[cс]\+\+|java\b|node\.?js[\s-]?developer|node\.?js\s*разработ\w*|junior|intern|стажер|стажёр|trainee|1\s?[сc]\b|дельфи|delphi|битрикс|bitrix|pl[\s/]*sql|\bdba\b|баз\w*\s+данных|систем\w*\s+администратор|администратор\w*\s+баз|митап|бизнес-аналитик|педагог|преподавател\w*)'

EXTRA_ARGS=("$@")

ARGS=(
  -L "$ROOT/letter.txt"
  -f
  --apply-delay-min 18
  --apply-delay-max 50
  --excluded-filter "$EXCLUDED_FILTER"
)

if [[ "${HH_USE_SEARCH:-}" == 1 ]]; then
  ARGS+=(
    --search "$SEARCH"
    --experience between3And6
  )
fi

exec $TOOL apply-vacancies "${ARGS[@]}" "${EXTRA_ARGS[@]}"
