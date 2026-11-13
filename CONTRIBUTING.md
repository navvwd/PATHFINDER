# Contributing

## Workflow

1. Branch from `main` (`feature/<short-name>`).
2. Keep changes modular: business rules go in `backend/app/services` or `ai-engine` - never in a client.
3. Add or update tests with every change. CI must be green before merge.
4. Schema change? Edit models, then `alembic revision --autogenerate -m "..."`, review the file, run `alembic check`.
5. API change? Run `npm run gen:types` so `packages/shared-types` and `docs/api/openapi.json` stay in sync.

## Code standards

| Area | Rules |
|---|---|
| Python | Type hints, Pydantic schemas for every request/response, `ruff check` clean. Services own transactions; routers stay thin. |
| Authorisation | Every route uses `require_permission(...)`; any student data access goes through `services/access.py`. |
| History | Never update or delete scores, evaluations, progress events or consent rows - append and supersede. |
| TypeScript | `strict` mode, no `any` in app code, shared types from `@pathfinder/shared-types`, API calls only via `@pathfinder/api-client`. |
| UI | Use `components/ui` primitives; every screen handles loading, error and empty states; keyboard and screen-reader accessible. |
| AI | Prompts only receive grounding facts (first name, age band, records). Validate structured output; always provide an engine fallback; label output. |
| Data | Only fictional data in seeds/tests (`pathfinder.demo`, `example.com`). Never commit secrets or `.env`. |

## Useful commands

```bash
cd backend && pytest -q                     # backend tests (fresh migrated DB per run)
cd ai-engine && pytest -q                   # engine tests
npm run typecheck && npm run test:web       # web
npm run e2e:web                             # needs API (:8000, seeded --demo) and web (:5173) running
cd apps/mobile && npx tsc --noEmit && npx jest
```

Commit messages: imperative mood, explain *why* when not obvious.
