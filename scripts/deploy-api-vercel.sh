#!/usr/bin/env bash
# Deploy the FastAPI backend to the Vercel project "pathfinder-api".
#
# The API needs two folders (backend/ and ai-engine/), so it is deployed from a
# small bundle instead of a Root Directory: backend app + migrations, the
# pathfinder_engine package, and an index.py entrypoint that Vercel's FastAPI
# runtime picks up. Usage:  scripts/deploy-api-vercel.sh [--prod]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.vercel-api"
ORG_ID="${VERCEL_ORG_ID:-team_0QUx0qObDRNeH9iJtJaMJ7gj}"
PROJECT_ID="${VERCEL_API_PROJECT_ID:-prj_mAVFDCiQ0BrUmnQEnjngU5DdkORz}"

mkdir -p "$OUT" && find "$OUT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
mkdir -p "$OUT/.vercel"
cp -r "$ROOT/backend/app" "$OUT/app"
cp -r "$ROOT/ai-engine/pathfinder_engine" "$OUT/pathfinder_engine"
cp "$ROOT/backend/requirements.txt" "$OUT/requirements.txt"
find "$OUT" -name "__pycache__" -type d -prune -exec rm -rf {} +

cat > "$OUT/index.py" <<'PY'
"""Vercel entrypoint: the FastAPI ASGI app."""
from app.main import app  # noqa: F401
PY

cat > "$OUT/.vercelignore" <<'IGN'
*.db
storage/
IGN

printf '{"orgId":"%s","projectId":"%s"}\n' "$ORG_ID" "$PROJECT_ID" > "$OUT/.vercel/project.json"

cd "$OUT"
vercel deploy --yes "$@"
