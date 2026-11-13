# API contract

- Base path: `/api/v1`. Interactive docs: `/docs` (Swagger) and `/redoc`. Machine-readable spec: [`openapi.json`](openapi.json) (regenerate with `npm run gen:types`, which also regenerates `packages/shared-types/src/openapi.ts`).
- 147 paths across the groups below. Every route declares Pydantic request/response schemas.

## Conventions

| Topic | Rule |
|---|---|
| Auth | `Authorization: Bearer <access_token>` (15 min). Refresh: web via httpOnly cookie + `X-Requested-With: pathfinder`; mobile via `{"refresh_token": ...}`. Rotation on every refresh; reuse revokes all sessions. |
| Success | Resource object, or page `{items, total, page, page_size}` |
| Errors | Always `{"error": {"code", "message", "details", "request_id"}}` with proper HTTP status (401, 403, 404, 409, 422, 429, 500) |
| Pagination | `page` (>=1), `page_size` (1-100) |
| Sorting | `sort=field` / `sort=-field` (allow-listed fields only) |
| Filtering | Typed query params (`domain_id`, `category`, `status`, `q`...) |
| Rate limits | Global per-IP per minute; stricter auth bucket; per-user hourly AI bucket. 429 + `Retry-After`. |
| Tracing | Every response carries `X-Request-ID` |

## Groups

| Group | Highlights |
|---|---|
| `/auth` | register/student, register/guardian, login, refresh, logout, logout-all, password/forgot, password/reset, password/change, me, sessions |
| `/users` | admin list/create/update/delete; `me` update; `me/export` (data portability); `me/delete` (account deletion) |
| `/students` | list (scoped), me, profile update, onboarding steps (`academic`, `interests`, `goals`, `guardian`, `complete`), dashboard |
| `/guardians` | children, link child, child overview, consents (get/set) |
| `/mentors` | my students, batches & members, review queue, feedback/observations |
| `/institutions` | register (public, pending approval), CRUD, campuses, academic years, classes, CSV student import, staff, mentor allocation, activity distribution, analytics, subscription |
| `/domains`, `/subdomains` | catalogue, detail (records voluntary exploration), admin CRUD, resources |
| `/interests` | current, update (logged), explore, questionnaire, evolution |
| `/activities` | list/filter (age-eligible for students), detail, CRUD, assign to students/batch, my assignments |
| `/files` | secure upload (type allow-list + magic bytes) and authorised download |
| `/submissions` | create (validates submission type, ownership of files), list, detail, add to portfolio |
| `/evaluations` | rubric-based submission evaluation, manual attempt grading, rubrics |
| `/assessments` | list/detail (answers hidden from students), create with question bank, start attempt (randomised, timed), save responses, submit (auto-grade), attempts history, pending review |
| `/progress` | summary, timeline (daily/weekly/monthly), events, reflections, snapshots, weekly goals |
| `/analytics` | domain scores (+history), recompute, platform analytics, versioned scoring config |
| `/recommendations` | latest set, generate, respond (accept/dismiss/disagree), mentor review |
| `/ai` | status, chat, summary, project-ideas, interest-analysis, skill-suggestions, parent-report, mentor-insights |
| `/portfolios` | get, update visibility, items CRUD, export, guardian approval, public shared view |
| `/roadmaps` | list, generate (7/30/90/180), update, milestones CRUD/status, mentor review |
| `/achievements` | XP, level, streaks, badges, recent XP, weekly goals |
| `/notifications`, `/messages` | inbox, unread count, mark read, preferences, broadcast; guardian-mentor messaging |
| `/reports` | list, detail, generate (weekly/monthly/parent), institution report |
| `/admin` | overview, audit logs, feature flags, settings (AI provider etc.), AI usage, system, plans, tenant approval |

## Example

```http
POST /api/v1/auth/login
{"identifier": "aarav@pathfinder.demo", "password": "Demo@1234", "client": "mobile"}

200 {"access_token": "eyJ...", "token_type": "bearer", "expires_in": 900, "refresh_token": "..."}
```

```http
GET /api/v1/recommendations
200 {
  "status": "ok",
  "message": "Based on your recorded activities and assessments.",
  "disclaimer": "These suggestions are based on recorded activities ... you are free to disagree.",
  "promising_domains": ["..."], "focus_domains": [],
  "items": [{"kind": "promising_domain", "title": "STEM & Technology looks promising",
             "reasons": ["Ranked #1 of 2 sufficiently assessed domain(s) by demonstrated evidence.", "..."], ...}]
}
```
