# PathFinder AI

AI-powered student interest discovery, skill development and personal growth platform - an Edutainal Ventures internship project.

Students (ages 6-21) explore six domains, **choose their own interests**, complete hands-on activities and assessments,
build a portfolio, and receive **explainable** development recommendations. Parents monitor authorised records and manage
consent; mentors assign and evaluate work with rubrics; institutions and administrators manage tenants, content and scoring.

**Principles built into the code:** interest is never confused with ability; improvement is only measured on comparable,
repeated work; untested domains are "not yet explored", never weaknesses; no recommendations without sufficient evidence;
students can disagree; no public rankings; no IQ-style scores; AI output is grounded, validated and labelled.

## What's in the repo

```
apps/web           React 19 + Vite + Tailwind 4 + TanStack Query + Zustand + Recharts + Framer Motion
apps/mobile        Expo (React Native) + Expo Router + NativeWind + SecureStore + Notifications
backend            FastAPI + SQLAlchemy 2 + Alembic + Pydantic 2 + JWT + Argon2  (54 tables, 147 API paths)
ai-engine          Pure-Python scoring, analytics, recommendation and report engine (NumPy)
packages           shared-types (generated from OpenAPI), api-client, validation (zod), design-system tokens
infrastructure     Dockerfiles, nginx, database ops, deployment runbook
docs               architecture + diagrams, ER diagram, API contract, user guides
```

## Quick start (no Docker - SQLite fallback)

Requirements: Python 3.11+, Node 20+.

```bash
# backend
python -m venv .venv && .venv/Scripts/activate        # macOS/Linux: source .venv/bin/activate
pip install -r backend/requirements-dev.txt && pip install -e ai-engine
cd backend && python -m app.cli migrate && python -m app.cli seed --demo
uvicorn app.main:app --reload --port 8000             # http://localhost:8000/docs

# web (new terminal, repo root)
npm install
npm run dev:web                                       # http://localhost:5173 (proxies /api to :8000)

# mobile (optional)
cd apps/mobile && npm install
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:8000/api/v1 npx expo start
```

Sign in with a demo account, e.g. `kabir@pathfinder.demo` / `Demo@1234` (all demo data is fictional - see
[user guides](docs/user-guides/README.md) for every role).

## Quick start (Docker - PostgreSQL + Redis)

```bash
cp .env.example .env            # set POSTGRES_PASSWORD and JWT_SECRET
docker compose up --build
docker compose exec backend python -m app.cli seed --demo
# web: http://localhost:8080   api docs: http://localhost:8000/docs
```

## Enabling Claude

Set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=...` in the API environment (default model `claude-opus-5-5`,
configurable by super admins). Without a key every AI feature uses the deterministic, record-grounded engine.
Minors' data is only sent to the LLM after a guardian grants **AI processing** consent.

## Tests

| Suite | Command | Result (latest run) |
|---|---|---|
| AI engine | `cd ai-engine && pytest` | 13 passed |
| Backend (API, auth, RBAC, tenancy, scoring, recommendations, security, migrations) | `cd backend && pytest` | 27 passed |
| Web unit (components, validation, API client) | `npm run test:web` | 11 passed |
| Web E2E (Playwright: student, mentor, parent, admin, phone viewport) | `npm run e2e:web` (API + web running) | 5 passed |
| Mobile unit (components, session, shared client) | `cd apps/mobile && npx jest` | 6 passed |
| Mobile E2E (Expo web, phone viewport) | `npx playwright test tests/e2e/mobile-app.spec.ts --project=mobile` | 2 passed |
| Typecheck / lint | `npm run typecheck`, `cd apps/mobile && npx tsc --noEmit`, `ruff check backend/app ai-engine` | clean |

See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) for phase-by-phase status and known limitations.

## Documentation

- [System architecture, flows and decisions](docs/architecture/system-architecture.md)
- [Database / ER diagram](docs/database/er-diagram.md)
- [API contract](docs/api/README.md) - live at `/docs`
- [User guides & demo accounts](docs/user-guides/README.md)
- [Deployment runbook (web, API, DB, storage, Android, iOS)](infrastructure/deployment/DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)
