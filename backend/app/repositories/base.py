"""Generic query helpers: pagination, sorting, soft-delete and tenant scoping."""

from __future__ import annotations

from typing import Any, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from ..core.deps import PageParams, is_global
from ..core.errors import NotFound
from ..models import User

T = TypeVar("T")


def paginate(db: Session, stmt: Select, params: PageParams, model: Any, allowed_sort: set[str]) -> dict:
    if params.sort:
        field = params.sort.lstrip("-")
        if field in allowed_sort and hasattr(model, field):
            col = getattr(model, field)
            stmt = stmt.order_by(col.desc() if params.sort.startswith("-") else col.asc())
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    items = db.scalars(stmt.offset(params.offset).limit(params.page_size)).unique().all()
    return {"items": list(items), "total": total, "page": params.page, "page_size": params.page_size}


def not_deleted(stmt: Select, model: Any) -> Select:
    return stmt.where(model.deleted_at.is_(None)) if hasattr(model, "deleted_at") else stmt


def tenant_filter(stmt: Select, model: Any, user: User, include_global: bool = True) -> Select:
    """Tenant isolation: non-global users only see rows of their institution
    (plus platform-global rows where ``institution_id IS NULL`` if allowed)."""
    if is_global(user) or not hasattr(model, "institution_id"):
        return stmt
    if user.institution_id is None:
        return stmt.where(model.institution_id.is_(None)) if include_global else stmt.where(False)
    cond = model.institution_id == user.institution_id
    if include_global:
        cond = cond | model.institution_id.is_(None)
    return stmt.where(cond)


def get_or_404(db: Session, model: type[T], id_: Any, what: str | None = None) -> T:
    obj = db.get(model, id_)
    if obj is None or getattr(obj, "deleted_at", None) is not None:
        raise NotFound(f"{what or model.__name__} not found")
    return obj
