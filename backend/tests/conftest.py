"""Test harness: a fresh database built through Alembic migrations (so every
test run also verifies the migration), seeded with the real catalogue."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="pathfinder-test-")
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{Path(_tmp, 'test.db').as_posix()}")
os.environ["ENVIRONMENT"] = "test"
os.environ["STORAGE_DIR"] = str(Path(_tmp, "storage"))
os.environ["AI_PROVIDER"] = "none"
os.environ["RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "100000"
os.environ["REDIS_URL"] = ""
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.cli import migrate  # noqa: E402
from app.core.database import session_scope  # noqa: E402
from app.core.ratelimit import limiter  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    migrate()
    from app.seed import seed_catalog, seed_demo

    with session_scope() as db:
        seed_catalog(db)
        seed_demo(db)
    yield


@pytest.fixture()
def client():
    from app.main import app

    limiter.reset()
    with TestClient(app) as c:
        yield c


def login(client: TestClient, email: str, password: str = "Demo@1234") -> dict:
    r = client.post("/api/v1/auth/login", json={"identifier": email, "password": password, "client": "mobile"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def as_user(client):
    def _as(name: str) -> dict:
        return login(client, f"{name}@pathfinder.demo")
    return _as


_counter = {"n": 0}


def unique_email(prefix: str = "user") -> str:
    _counter["n"] += 1
    return f"{prefix}{_counter['n']}-{os.getpid()}@example.com"


def register_student(client: TestClient, age: int = 13, **extra) -> tuple[dict, dict]:
    from datetime import date

    dob = date(date.today().year - age, 1, 1).isoformat()
    body = {"full_name": "Test Student", "email": unique_email("stu"), "password": "Passw0rd!", "date_of_birth": dob, **extra}
    r = client.post("/api/v1/auth/register/student", json=body)
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, body
