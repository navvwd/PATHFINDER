# Deployment guide

> Status: the stack has been verified locally (API + web + Expo web) and in automated tests. No production
> deployment has been performed yet; the steps below are the prepared runbook.

## 0. Prerequisites and secrets

| Secret | Where |
|---|---|
| `JWT_SECRET` (>= 32 chars, random) | API env |
| `DATABASE_URL` (`postgresql+psycopg://...`) | API env |
| `REDIS_URL` | API env (required when running >1 API instance) |
| `ANTHROPIC_API_KEY` (optional) | API env only - never in web/mobile builds |
| `POSTGRES_PASSWORD` | DB / compose |

Production refuses to start with the dev JWT secret or SQLite (`Settings.validate_production`).
Set `ENVIRONMENT=production`, `COOKIE_SECURE=true`, `CORS_ORIGINS=https://app.example.com`.

## 1. Single host with Docker Compose (simplest)

```bash
cp .env.example .env    # set secrets, ENVIRONMENT=production, COOKIE_SECURE=true
docker compose up -d --build
docker compose exec backend python -m app.cli seed          # catalogue only (no demo data)
```
Put a TLS-terminating reverse proxy (Caddy, nginx, a cloud load balancer) in front of `web:80` -
HTTPS is mandatory (HSTS is sent automatically in production).

## 2. Managed / cloud deployment

| Component | Recommended | Notes |
|---|---|---|
| Web (static) | Any static host or CDN (Vercel, Netlify, S3+CloudFront, nginx image) | `npm run build -w @pathfinder/web` -> `apps/web/dist`. Serve the API on the same origin under `/api` (rewrite/proxy) so the refresh cookie stays first-party; otherwise set `VITE_API_URL` and `COOKIE_SECURE=true`. SPA fallback to `index.html`. |
| Backend | Container platform (Cloud Run, ECS/Fargate, Fly.io, Render, Railway, Kubernetes) | Image: `infrastructure/docker/backend.Dockerfile`. Health: `/health` (liveness), `/health/ready` (DB). Migrations run on start. Scale horizontally; it is stateless. |
| Database | Managed PostgreSQL 15+ (RDS, Cloud SQL, Neon, Supabase, Azure Database) in an Indian region (e.g. ap-south-1 / asia-south1) for data-residency expectations | Enable automated backups + PITR. |
| Redis | Managed Redis (ElastiCache, Upstash, Memorystore) | Used for shared rate limits. |
| Object storage | S3-compatible bucket (S3, GCS, R2, MinIO) | Replace `LocalStorage` in `services/storage.py` with an S3 implementation of `save/path/delete`, or mount a persistent volume at `STORAGE_DIR`. Keep the bucket private - downloads are served through the authorised `/files/{id}` endpoint. |
| Logs | Ship stdout JSON lines to your log platform (CloudWatch, Cloud Logging, Loki, Datadog) | Every line carries `request_id`, `user_id`, `path`, `status`, `duration_ms`. |
| Error monitoring | Sentry or equivalent | Hook into `register_error_handlers` (`_unhandled`) and the web `ErrorState`. |

### Scheduled jobs
- `python -m app.cli purge-deleted` daily (data-retention purge of deleted accounts).
- Optional: weekly snapshot / report generation via the API (`/progress/snapshots`, `/reports/generate`).

## 3. Mobile builds (Expo / EAS)

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure
# point the app at the production API
EXPO_PUBLIC_API_URL=https://app.example.com/api/v1 npx eas-cli@latest build --platform android --profile production
EXPO_PUBLIC_API_URL=https://app.example.com/api/v1 npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform android   # Google Play
npx eas-cli@latest submit --platform ios       # App Store Connect (requires Apple Developer account)
```
- Android package / iOS bundle id: `com.edutainal.pathfinder` (change in `app.json` if needed).
- Local development build: `npx expo run:android` / `npx expo run:ios` (requires Android Studio / Xcode).
- Over-the-air JS updates: `npx eas-cli@latest update`.
- Remote push notifications are behind the `mobile_push` feature flag; the app currently schedules local daily reminders only.

## 4. Release checklist

- [ ] CI green (backend on PostgreSQL, web unit + E2E, mobile, Docker builds)
- [ ] `alembic upgrade head` succeeded on a staging copy of production data
- [ ] Secrets set; `ENVIRONMENT=production`; `COOKIE_SECURE=true`; HTTPS enforced
- [ ] Backups verified (restore test)
- [ ] Privacy notice and consent policy version (`system_settings.privacy.policy_version`) reviewed with counsel for DPDP Act compliance
- [ ] Demo data **not** loaded (`seed` without `--demo`)
