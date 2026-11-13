# PathFinder AI - System Architecture

## 1. System overview

```mermaid
flowchart LR
  subgraph Clients
    W[Web app<br/>React 19 + Vite + Tailwind]
    M[Mobile app<br/>Expo / React Native]
  end
  subgraph Shared["Shared TS packages"]
    AC[api-client]
    ST[shared-types<br/>generated from OpenAPI]
    VA[validation - zod]
    DS[design-system tokens]
  end
  W --> AC
  M --> AC
  AC --> ST
  W --> VA & DS
  M --> VA & DS

  subgraph API["FastAPI backend (stateless, horizontally scalable)"]
    MW[Middleware<br/>request-id, rate limit,<br/>security headers, JSON logs]
    R[Routers /api/v1/*]
    AUTH[Auth + RBAC<br/>permission guards]
    ACC[Record-level access<br/>services/access.py]
    SVC[Domain services<br/>onboarding, activities, assessments,<br/>progress, recommendations, roadmaps...]
    AIL[AI layer<br/>provider interface, prompts,<br/>schemas, fallback, usage logs]
  end
  ENG[pathfinder_engine<br/>scoring, analytics,<br/>recommendation, reports]
  PG[(PostgreSQL<br/>54 tables, Alembic)]
  RD[(Redis<br/>rate limits)]
  FS[(File storage<br/>local / S3-compatible)]
  LLM[[Claude API<br/>optional]]

  AC -- HTTPS JSON + JWT --> MW --> R --> AUTH --> ACC --> SVC
  SVC --> ENG
  SVC --> AIL --> ENG
  AIL -. structured output .-> LLM
  SVC --> PG
  MW --> RD
  SVC --> FS
```

**Key properties**

| Concern | Decision |
|---|---|
| Business logic | Lives only on the server (`backend/app/services`) and in the pure `ai-engine` package. Web and mobile share one typed API client, so no rule is implemented twice. |
| Authorisation | Permission-based RBAC (`core/permissions.py`) on every route **plus** record-level checks (`services/access.py`) for every student record. Nothing relies on the frontend. |
| Tenancy | Institution-scoped rows carry `institution_id`; `repositories/base.tenant_filter` and `access.accessible_student_ids` restrict every query. Cross-tenant reads return 404. |
| History | Scores, evaluations, progress events, interest changes and consent are append-only. Re-evaluation supersedes, never deletes. |
| AI | Provider-independent interface; Claude through the official SDK with structured outputs; deterministic record-grounded fallback for every feature; guardian consent required for minors. |
| Explainability | Every score lists its dimensions, weights, evidence count and confidence; every recommendation lists its reasons. |

## 2. Request lifecycle

```mermaid
sequenceDiagram
  participant C as Client (web/mobile)
  participant M as Middleware
  participant R as Router
  participant G as Permission guard
  participant A as Access service
  participant S as Service
  participant E as Engine
  participant DB as PostgreSQL
  C->>M: POST /api/v1/evaluations/submissions/{id} (Bearer JWT)
  M->>M: request id, global rate limit
  M->>R: dispatch
  R->>G: require_permission(submissions:evaluate)
  G->>DB: load user, check token_version
  R->>A: ensure_student_access(user, student, write)
  A->>DB: mentor batches / institution membership
  R->>S: evaluate_submission()
  S->>DB: insert EvaluationRecord, supersede old evidence, add ProgressEvent
  S->>E: score_domain() for each domain
  S->>DB: insert DomainScore history rows, notifications, audit log
  R-->>C: 201 EvaluationOut (+ X-Request-ID)
```

## 3. Scoring and recommendation pipeline

```mermaid
flowchart TD
  I[Interest selections + voluntary exploration] --> IS[Interest score A]
  EV[ProgressEvents with scores<br/>activities, assessments, projects] --> D{7 dimensions}
  D --> P1[Performance 20%]
  D --> P2[Learning progress 20%<br/>same scale_key only]
  D --> P3[Problem-solving 15%]
  D --> P4[Creativity 15%]
  D --> P5[Consistency 10%]
  D --> P6[Engagement 10%]
  D --> P7[Adaptability 10%]
  P1 & P2 & P3 & P4 & P5 & P6 & P7 --> SK[Demonstrated skill score B<br/>weights renormalised over measured dims]
  P2 --> PR[Progress score C]
  EV --> CF[Evidence confidence D<br/>volume, diversity, recency,<br/>mentor validation, quality]
  IS & SK & PR & CF --> DS[(domain_scores history)]
  DS --> RE{Recommendation engine}
  RE -->|no sufficiently assessed domain| X[insufficient_data:<br/>exploration + starter activities only]
  RE -->|top 3 sufficiently assessed| PD[Promising domains + advanced validation challenge]
  PD -->|>=2 validated by mentor, level 4+| FD[Two focus domains]
  RE --> AL[Interest vs evidence alignment notes]
  RE --> AA[Adaptive-difficulty activity suggestions]
  RE --> EX[Not-yet-explored domains - never 'weak']
```

Scoring weights are versioned in `scoring_configs`; each `domain_scores` row records the version used.

## 4. User flows

```mermaid
flowchart LR
  subgraph Student
    S1[Register] --> S2[Onboarding:<br/>academic, interests,<br/>goals, guardian code] --> S3[Dashboard]
    S3 --> S4[Explore 6 domains] --> S5[Choose / change interests]
    S3 --> S6[Activities: submit work] --> S7[Mentor review]
    S3 --> S8[Assessments: auto-graded / reviewed]
    S7 & S8 --> S9[Progress analytics + scores]
    S9 --> S10[Recommendations: accept / disagree]
    S10 --> S11[Roadmap 7/30/90/180 days]
    S7 --> S12[Portfolio]
  end
  subgraph Parent
    P1[Register with invite code] --> P2[Grant consent] --> P3[Child overview, progress,<br/>portfolio, reports] --> P4[Message mentor]
  end
  subgraph Mentor
    M1[Batches] --> M2[Assign activities] --> M3[Review queue:<br/>rubric evaluation] --> M4[Feedback, insights,<br/>recommendation review]
  end
  subgraph Institution
    I1[Register - approval] --> I2[Campuses, years, classes] --> I3[Import students CSV] --> I4[Allocate mentors] --> I5[Aggregate analytics]
  end
```

## 5. Architectural decision records

1. **Monorepo with npm workspaces** for web + shared packages; the Expo app is a sibling project that consumes the shared packages through Metro `extraNodeModules` (keeps React Native's pinned React version independent of the web app's).
2. **Pure scoring engine package** (`ai-engine/pathfinder_engine`) with no DB or framework imports - deterministic, unit-testable, reusable for reports and AI grounding.
3. **Append-only evidence stream** (`progress_events`) is the single source for scores and analytics; evaluations supersede rather than overwrite.
4. **Comparable-only improvement**: progress is measured within a `scale_key` (same assessment/activity). Improvement % returns `null` for zero/absent baselines.
5. **Tokens**: 15-minute JWT access tokens kept in memory; rotating opaque refresh tokens stored hashed. Web uses an httpOnly, SameSite=Strict, path-scoped cookie plus an `X-Requested-With` header (CSRF); mobile keeps the refresh token in the OS keychain (expo-secure-store). Refresh-token reuse revokes all sessions.
6. **SQLite fallback** for zero-setup local development and fast tests; PostgreSQL (JSONB) in Docker, CI and production. Alembic migrations are tested in CI and by `alembic check`.
7. **AI is optional and never authoritative**: structured outputs are validated, hallucinated IDs are stripped, failures fall back to the rule-based engine, and all output is labelled.
