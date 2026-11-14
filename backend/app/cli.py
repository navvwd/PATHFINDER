"""Operational CLI.

    python -m app.cli migrate        # alembic upgrade head
    python -m app.cli seed           # platform catalogue only
    python -m app.cli seed --demo    # catalogue + fictional demo data
    python -m app.cli purge-deleted  # data-retention purge of deleted accounts
"""

from __future__ import annotations

import argparse
import sys
from datetime import timedelta
from pathlib import Path

from sqlalchemy import select

from .core.config import get_settings
from .core.database import session_scope
from .core.security import utcnow


def migrate() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(cfg, "head")


def seed(demo: bool) -> None:
    from .seed import seed_catalog, seed_demo

    # Separate transactions: a failed demo load must not roll back the catalogue.
    with session_scope() as db:
        print("catalog:", seed_catalog(db))
    if demo:
        with session_scope() as db:
            print("demo:", seed_demo(db))


def purge_deleted() -> None:
    """Hard-delete accounts whose soft-deletion is older than the retention window.
    Cascading foreign keys remove the student's learning records with them."""
    from .models import User

    days = get_settings().DATA_RETENTION_DAYS_AFTER_DELETION
    cutoff = utcnow() - timedelta(days=days)
    with session_scope() as db:
        rows = db.scalars(select(User).where(User.deleted_at.is_not(None), User.deleted_at < cutoff)).all()
        for u in rows:
            db.delete(u)
        print(f"purged {len(rows)} account(s) deleted before {cutoff.date()}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="pathfinder")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate")
    s = sub.add_parser("seed")
    s.add_argument("--demo", action="store_true")
    sub.add_parser("purge-deleted")
    args = p.parse_args(argv)
    if args.cmd == "migrate":
        migrate()
    elif args.cmd == "seed":
        seed(args.demo)
    elif args.cmd == "purge-deleted":
        purge_deleted()
    return 0


if __name__ == "__main__":
    sys.exit(main())
