# Database operations

- Schema: `backend/migrations` (Alembic). ER diagram: [`docs/database/er-diagram.md`](../../docs/database/er-diagram.md).
- Apply migrations: `python -m app.cli migrate` (also runs automatically when the API container starts).
- Seed platform catalogue (domains, activities, assessments, badges, plans): `python -m app.cli seed`.
- Seed fictional demo data (never in production): `python -m app.cli seed --demo`.

## Backups (PostgreSQL)

```bash
docker compose exec postgres pg_dump -U pathfinder -Fc pathfinder > backup-$(date +%F).dump
docker compose exec -T postgres pg_restore -U pathfinder -d pathfinder --clean < backup.dump
```

## Data retention

- Account deletion anonymises identifiers immediately and soft-deletes profiles.
- `python -m app.cli purge-deleted` permanently removes accounts deleted more than
  `DATA_RETENTION_DAYS_AFTER_DELETION` days ago (cascades to learning records). Schedule daily.
- `audit_logs`, `consent_records` keep the compliance trail (actor ids become NULL after purge).
