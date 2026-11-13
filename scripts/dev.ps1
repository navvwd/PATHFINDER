# Starts the local dev stack on Windows: API (:8000, SQLite + demo data) and web (:5173).
# Usage: powershell -ExecutionPolicy Bypass -File scripts/dev.ps1 [-Reset]
param([switch]$Reset)
$root = Split-Path -Parent $PSScriptRoot
$py = Join-Path $root ".venv\Scripts\python.exe"
Push-Location (Join-Path $root "backend")
if ($Reset -and (Test-Path "pathfinder_dev.db")) { Remove-Item "pathfinder_dev.db" -Confirm:$false }
& $py -m app.cli migrate
if ($Reset -or -not (Test-Path "pathfinder_dev.db.seeded")) { & $py -m app.cli seed --demo; New-Item "pathfinder_dev.db.seeded" -ItemType File -Force | Out-Null }
Start-Process -NoNewWindow $py -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"
Pop-Location
Push-Location $root
npm run dev:web
Pop-Location
