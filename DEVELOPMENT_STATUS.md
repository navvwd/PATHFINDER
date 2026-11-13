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

## Role experience redesign (uich.md brief)

- **Brand tokens**: one palette derived from the landing page, exposed under canonical names (`--color-primary #FF4D24`, `--color-primary-hover #E93822`, `--color-secondary #171717`, `--color-accent #C72E12`, `--color-background #F7F7F5`, `--color-surface #FFFFFF`, `--color-surface-muted #EEEEEC`, `--color-text-primary #171717`, `--color-text-secondary #6B6B6B`, `--color-border #E5E5E3`, `--color-success #15803D`, `--color-warning #A16207`, `--color-danger #E93822`). Removed off-brand hues: info blue, amber accent, old domain colours (migrated in the DB), confidence colours, chart fallbacks and the free colour picker (domains now pick from brand swatches). White-on-orange selected states (contrast fail) became ink. Status is always icon + text, never colour alone. Mobile tokens aligned.
- **Student**: friendlier login (split welcome panel, show/hide password, caps-lock hint, remember me, forgot password, inline validation). New Home (welcome, level/class, today's goal, quick actions, continue learning, tasks, next live session, week strip, streak/badges/encouragement), plus My Courses, My Tasks, Live Sessions, My Progress, Messages (students can message their mentors) and My Profile. Older pages are kept under a collapsible "Explore & grow" group; no routes were removed.
- **Mentor**: overview led by "students who need support" (inactive 14d, reviews waiting >3d, overdue tasks, attendance <75%, disagreed suggestions) with reasons in plain words; Sessions & Attendance page (schedule for a batch or chosen students, cancel, mark attendance).
- **Guardian**: per-child card answering "Is X progressing? Any pending tasks? Is attendance OK? What did the mentor say?", next session and latest badge; detail view adds tasks, attendance and achievements. Guardians never receive meeting links.
- **Super admin**: dense overview (users by role, active/inactive, sign-ins, allocation gaps, content, sessions, attendance, needs-attention list, recent activity log), Roles & Permissions matrix (read from the API's enforcement rules), Mentor Allocation.
- **Backend**: `live_sessions` and `session_participants` tables (migration `593b0cb139da`), `sessions:manage` permission; `/sessions` (role-scoped list, create, update/cancel, attendance get/put, attendance summary), `/students/courses|tasks|week`, `/mentors/me/attention`, `/admin/roles`, richer `/admin/overview` and guardian overview, `remember_me` on login (12-hour session cookie when unticked), `unallocated` filter on `/students`. Demo seed adds 8 past sessions with attendance and 3 upcoming sessions per batch.

## Test results (latest local run)

| Suite | Result |
|---|---|
| AI engine (pytest) | 13 passed |
| Backend (pytest, SQLite, migrated via Alembic) | 36 passed |
| Web unit (Vitest + RTL) | 11 passed |
| Web E2E (Playwright, live API + web) | 15 passed - student journey, mentor evaluation, parent answers/consent/reports, admin + student blocked from admin, per-role navigation and cross-portal redirects, student courses/tasks/sessions, mentor attendance, phone-width (no sideways scroll) for every redesigned page of all four roles, editorial flows. Needs raised API rate limits - see `apps/web/playwright.config.ts` |
| Mobile unit (jest-expo + RNTL) | 6 passed |
| Mobile E2E (Playwright on Expo web, Pixel 7 viewport) | 2 passed |
| Android JS bundle (`expo export`) | Builds (1,645 modules) |
| Typecheck (web, mobile) / ruff | Clean |
| Performance (local, 30 requests each) | Dashboard p95 13 ms, progress summary 9 ms, domain scores 6 ms, recommendation generation 35 ms |

## API status

147 paths across all 23 required groups plus `/files`, `/messages`, `/health`. OpenAPI: `docs/api/openapi.json`.

## Database status

Migrations `5dedf4a4c7f6` (initial) and `593b0cb139da` (live sessions, attendance, brand domain colours). Verified on SQLite (upgrade, downgrade, re-upgrade, `alembic check`).
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
10. **Global rate limit is per IP** (240 requests/min). A whole classroom behind one school NAT address shares it, and the new dashboards make 5-7 requests per page. Consider keying the limit by user for authenticated requests before school rollout.
11. **Live sessions** store a meeting link only; there is no video-provider integration, calendar invite (.ics) export or recurring-session support yet.
9. **DPDP Act**: consent ledger, guardian consent for under-18s, export, deletion and retention purge are implemented; a legal review of notices and policy text is still required.

## Bugs found and fixed during verification

- Assessment responses duplicated on submit (relationship not refreshed) - fixed, covered by tests.
- Token refresh shared the strict login rate-limit bucket, logging users out under load - separate bucket.
- CSV-style list env vars (`CORS_ORIGINS`) failed to parse - fixed with `NoDecode` + validator.
- NativeWind crashed on web with media dark mode - switched to class strategy.
- Mobile progress/alert views were not exposed to screen readers - marked `accessible`.
