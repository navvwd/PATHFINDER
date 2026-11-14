"""Copy every table from one database to another in batched, short transactions.

Used to load demo data into a remote database (e.g. Neon) without one long
transaction over a high-latency link: seed a local SQLite file first, then

    python -m app.copy_db --source sqlite:///seed.db --target "$DATABASE_URL" [--replace]

Both databases must be at the same migration revision. ``--replace`` empties
the target's tables first (never use it against a database with real users).
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import create_engine, func, select, text

from .core.config import Settings
from .models import Base

BATCH = 500


def _url(v: str) -> str:
    return Settings._psycopg_driver(v)  # same normalisation as the app


def copy(source: str, target: str, replace: bool) -> None:
    src = create_engine(_url(source))
    dst = create_engine(_url(target), connect_args={"prepare_threshold": None} if "psycopg" in _url(target) else {})
    tables = Base.metadata.sorted_tables
    with dst.begin() as c:
        nonempty = [t.name for t in tables if c.execute(select(func.count()).select_from(t)).scalar()]
        if nonempty and not replace:
            sys.exit(f"Target is not empty ({', '.join(nonempty[:5])}...). Re-run with --replace to overwrite.")
        if nonempty:
            c.execute(text("TRUNCATE " + ", ".join(f'"{t.name}"' for t in tables) + " CASCADE"))
    total = 0
    for t in tables:
        with src.connect() as s:
            rows = [dict(r._mapping) for r in s.execute(select(t))]
        for i in range(0, len(rows), BATCH):
            with dst.begin() as c:
                c.execute(t.insert(), rows[i:i + BATCH])
        total += len(rows)
        if rows:
            print(f"{t.name}: {len(rows)}", flush=True)
    print(f"copied {total} rows across {len(tables)} tables")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--source", required=True)
    ap.add_argument("--target", required=True)
    ap.add_argument("--replace", action="store_true")
    a = ap.parse_args()
    copy(a.source, a.target, a.replace)
