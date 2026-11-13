"""FastAPI dependencies: current user, permission guards, pagination."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..models import User
from .database import get_db
from .errors import Forbidden, RateLimited, Unauthorized
from .permissions import GLOBAL_ROLES, P, Role, has_permission
from .ratelimit import limiter
from .security import decode_access_token

bearer = HTTPBearer(auto_error=False)
DB = Annotated[Session, Depends(get_db)]


def get_current_user(
    request: Request,
    db: DB,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> User:
    if creds is None or creds.scheme.lower() != "bearer":
        raise Unauthorized("Authentication required")
    try:
        payload = decode_access_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise Unauthorized("Access token expired", code="token_expired")
    except jwt.PyJWTError:
        raise Unauthorized("Invalid access token", code="invalid_token")
    user = db.get(User, uuid.UUID(payload["sub"]))
    if user is None or user.deleted_at is not None or not user.is_active:
        raise Unauthorized("Account is not active")
    if payload.get("tv") != user.token_version:
        raise Unauthorized("Session has been revoked", code="session_revoked")
    request.state.user_id = str(user.id)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_permission(*perms: P):
    """All listed permissions are required. Enforced server-side for every route."""

    def _dep(user: CurrentUser) -> User:
        missing = [p.value for p in perms if not has_permission(user.role, p)]
        if missing:
            raise Forbidden("You do not have permission to perform this action", details={"missing": missing})
        return user

    return _dep


def require_roles(*roles: Role):
    allowed = {r.value for r in roles}

    def _dep(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise Forbidden("This area is not available for your role")
        return user

    return _dep


def is_global(user: User) -> bool:
    return user.role in {r.value for r in GLOBAL_ROLES}


def rate_limit(name: str, limit: int, window_seconds: int = 60):
    def _dep(request: Request) -> None:
        ident = getattr(request.state, "user_id", None) or (request.client.host if request.client else "anon")
        ok, _ = limiter.hit(f"{name}:{ident}", limit, window_seconds)
        if not ok:
            raise RateLimited("Too many requests, please slow down")

    return _dep


@dataclass
class PageParams:
    page: int
    page_size: int
    sort: str | None
    q: str | None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def page_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str | None = Query(None, max_length=40, pattern=r"^-?[a-z_]+$"),
    q: str | None = Query(None, max_length=100),
) -> PageParams:
    return PageParams(page=page, page_size=page_size, sort=sort, q=q)


Paging = Annotated[PageParams, Depends(page_params)]
