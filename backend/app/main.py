from __future__ import annotations

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .api.v1 import activities, admin, ai, assessments, auth, domains, growth, institutions, interests, people, progress, students
from .core.config import get_settings
from .core.database import SessionLocal
from .core.errors import register_error_handlers
from .core.logging import configure_logging
from .core.ratelimit import limiter
from .middleware.http import RequestContextMiddleware

settings = get_settings()
configure_logging(settings.DEBUG)

app = FastAPI(
    title="PathFinder AI API",
    version="1.0.0",
    description=(
        "AI-powered student interest discovery, skill development and personal growth platform.\n\n"
        "**Response format** - success responses return the resource (or a page `{items,total,page,page_size}`); "
        "errors always return `{error: {code, message, details, request_id}}`.\n\n"
        "**Auth** - `Authorization: Bearer <access_token>`. Web clients refresh through an httpOnly cookie; "
        "mobile clients send `refresh_token` in the body."
    ),
    openapi_url=f"{settings.API_PREFIX}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)
register_error_handlers(app)

api = APIRouter(prefix=settings.API_PREFIX)
for module in (auth, students, domains, interests, activities, assessments, progress, growth, ai, people,
               institutions, admin):
    api.include_router(module.router)
app.include_router(api)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


@app.get("/health/ready", tags=["health"])
def ready():
    db_ok = True
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": db_ok, "rate_limiter": limiter.backend}
