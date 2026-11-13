#!/usr/bin/env bash
# Starts the local dev stack: API (:8000, SQLite + demo data) and web (:5173).
# Usage: scripts/dev.sh [--reset]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/.venv/bin/python"; [ -x "$PY" ] || PY="$ROOT/.venv/Scripts/python"
cd "$ROOT/backend"
if [ "${1:-}" = "--reset" ]; then rm -f pathfinder_dev.db pathfinder_dev.db.seeded; fi
"$PY" -m app.cli migrate
if [ ! -f pathfinder_dev.db.seeded ]; then "$PY" -m app.cli seed --demo && touch pathfinder_dev.db.seeded; fi
"$PY" -m uvicorn app.main:app --reload --port 8000 &
API_PID=$!
trap 'kill $API_PID' EXIT
cd "$ROOT" && npm run dev:web
