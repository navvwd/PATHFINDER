# Development status

_Last updated: 2026-11-14_

## Phase tracker

| Phase | Status | Notes |
|---|---|---|
| 0 Project initialisation | Done | Monorepo, git, venv, npm workspaces, `.env.example`, lockfiles (`package-lock.json`, `backend/requirements.lock`, `apps/mobile/package-lock.json`) |
| 1 Architecture & system design | Done | `docs/architecture` (system, request, scoring and user-flow diagrams + ADRs) |
| 2 Database schema & migrations | Done | 54 tables, initial Alembic migration; upgrade/downgrade/`alembic check` verified |
| 3 Backend infrastructure | Done | Config, JSON logging, request IDs, error format, rate limiting (Redis or memory), security headers, health checks |
| 4 Authentication & authorisation | Done | Argon2id, JWT access + rotating refresh (cookie for web, keychain for mobile), lockout, password reset, sessions, 7 roles, permission + record-level checks, tenant isolation |
| 5 Student onboarding | Done | 5-step tracker, profile editing, configurable age groups, guardian invite + consent |
| 6 Six-domain management | Done | Domains, subdomains, advantages, skill categories, roadmaps, resources; admin CRUD |
| 7 Student web application | Done | All 19 student pages connected to the API |
| 8 Student mobile application | Done (core) | Expo Router app for students and parents using the shared API client; see limitations |
| 9 Activity & assessment engine | Done | 52 activities, 13 assessments, rubrics, assignments, submissions with files, randomised timed attempts, auto + manual grading |
| 10 Progress analytics | Done | Event-sourced; initial/current/average, comparable-only improvement, trend, consistency, completion; daily/weekly/monthly + snapshots |
| 11 Interest & recommendation engine | Done | Questionnaire, evolution tracker, explainable recommendations, top-3 promising -> validated top-2 focus, disagreement, mentor review |
| 12 AI integration | Done | Provider interface, Claude via official SDK with structured outputs, prompt templates, validation, rate limits, token logging, consent gate, engine fallback |
| 13 Portfolio & roadmap | Done | Private-by-default portfolio, guardian-approved sharing, export; 7/30/90/180-day roadmaps with custom steps and mentor review |
| 14 Parent portal | Done | Multi-child, overview, progress, portfolio, reports, consent ledger, messaging |
| 15 Mentor portal | Done | Batches, assignment, review queue, rubric grading, feedback/observations, insights, recommendation & roadmap review, content creation |
| 16 Institution portal | Done | Registration + approval, campuses, years, classes, CSV import, staff, mentor allocation, activity distribution, aggregate analytics, subscription |
| 17 Admin dashboards | Done | Admin: users, institutions, domains, content, broadcast. Super admin: scoring versions, AI settings/usage, feature flags, audit/security logs, system |
| 18 Testing & security | Done | See test results; security tests cover authz, tenancy, injection, upload validation, rate limits, token reuse |
| 19 Deployment & documentation | Prepared, not deployed | Dockerfiles, compose, CI workflow, deployment runbook. **No production deployment has been performed.** |

## UI redesign (ui.md brief)

- Editorial design system: neutrals `#F7F7F5/#EEEEEC/#171717`, orange-red accent `#FF4D24/#E93822`, Space Grotesk + Inter; light and dark themes. Orange text uses an AA-safe ink (`#C72E12`); orange buttons use dark text (AA), default buttons are ink-black.
- Marketing site rebuilt with all 11 sections (floating nav + mobile menu, cinematic hero with parallax and oversized type, discovery statement, asymmetric domain cards with multi-select carried into onboarding, scroll-drawn "how it works" timeline, labelled dashboard preview, live challenges from `GET /activities/featured`, AI insights with a clearly labelled example, parent/mentor cards, dark final CTA, footer). Motion respects `prefers-reduced-motion`.
- New public pages: Privacy Policy, Terms and Conditions, Contact (form posts to `POST /contact`, delivered to platform admins).
- Student app navigation follows the brief: My Interests, Explore Domains, Interest Discovery, Activities, Challenges, Assessments, My Skills, Growth Timeline, AI Insights, Personal Roadmap, Portfolio, Achievements (+ Notifications, Profile & Settings in the header).
- Not done from the brief: social links (no official accounts provided - omitted rather than placeholder links), a content-moderation queue (needs a moderation data model), and photographic/3D imagery (abstract code-drawn visuals used instead).

## Test results (latest local run)

| Suite | Result |
|---|---|
| AI engine (pytest) | 13 passed |
| Backend (pytest, SQLite, migrated via Alembic) | 29 passed |
| Web unit (Vitest + RTL) | 11 passed |
| Web E2E (Playwright, live API + web) | 6 passed - student journey, mentor evaluation, parent consent/reports, admin + student blocked from admin, phone viewport, redesign flows (domain preselect -> onboarding, new student pages) |
| Mobile unit (jest-expo + RNTL) | 6 passed |
| Mobile E2E (Playwright on Expo web, Pixel 7 viewport) | 2 passed |
| Android JS bundle (`expo export`) | Builds (1,645 modules) |
| Typecheck (web, mobile) / ruff | Clean |
| Performance (local, 30 requests each) | Dashboard p95 13 ms, progress summary 9 ms, domain scores 6 ms, recommendation generation 35 ms |

## API status

147 paths across all 23 required groups plus `/files`, `/messages`, `/health`. OpenAPI: `docs/api/openapi.json`.

## Database status

Initial migration `5dedf4a4c7f6`. Verified on SQLite (upgrade, downgrade, re-upgrade, `alembic check`).
PostgreSQL-specific types (UUID, JSONB) are configured; the PostgreSQL run is wired into CI but has **not been
executed in this environment** (no Docker/PostgreSQL available locally).

## Deployment status

Not deployed. Docker images and compose are written but **not built locally** (Docker is not installed on the
development machine); CI builds them. See `infrastructure/deployment/DEPLOYMENT.md`.

## Known limitations / pending work

1. **PostgreSQL + Docker not exercised locally** - first CI run will be the first real PostgreSQL/Docker verification.
2. **Claude integration tested with a fake provider only** - no API key was available; the real call path (`AnthropicProvider`) is unverified against the live API.
3. **Password reset delivery**: no email/SMS provider; dev/test returns the reset token in the API response (disabled in staging/production).
4. **File storage** is local disk; an S3-compatible adapter is needed for multi-instance production.
5. **Remote push notifications** not implemented (feature flag `mobile_push` off); mobile schedules local reminders.
6. **Mobile scope**: students and parents. Onboarding, interest questionnaire, roadmap editing and mentor/admin tools are web-only. Mobile UI is light-theme only. Not yet run on physical devices or native emulators (verified via Expo web + Android bundle).
7. **Error monitoring** (e.g. Sentry) not wired; structured logs are ready for shipping.
8. **Progress snapshots** are generated on demand, not by a scheduler.
9. **DPDP Act**: consent ledger, guardian consent for under-18s, export, deletion and retention purge are implemented; a legal review of notices and policy text is still required.

## Bugs found and fixed during verification

- Assessment responses duplicated on submit (relationship not refreshed) - fixed, covered by tests.
- Token refresh shared the strict login rate-limit bucket, logging users out under load - separate bucket.
- CSV-style list env vars (`CORS_ORIGINS`) failed to parse - fixed with `NoDecode` + validator.
- NativeWind crashed on web with media dark mode - switched to class strategy.
- Mobile progress/alert views were not exposed to screen readers - marked `accessible`.
