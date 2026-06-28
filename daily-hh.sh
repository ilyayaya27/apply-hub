#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PY="$ROOT/.venv/bin/python"

cd "$ROOT"
mkdir -p "$ROOT/logs"

echo "[$(date)] refresh-token"
$PY -m hh_applicant_tool refresh-token

echo "[$(date)] update-resumes"
$PY -m hh_applicant_tool update-resumes

echo "[$(date)] reply-employers"
"$ROOT/reply-employers.sh" >> "$ROOT/logs/daily.log" 2>&1 || true

echo "[$(date)] apply-vacancies"
"$ROOT/apply-vacancies.sh" >> "$ROOT/logs/daily.log" 2>&1
