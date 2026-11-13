from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from ..models import AuditLog, User


def audit(
    db: Session,
    action: str,
    *,
    actor: User | None = None,
    entity_type: str | None = None,
    entity_id: Any = None,
    category: str = "data",
    request: Request | None = None,
    details: dict | None = None,
    institution_id: uuid.UUID | None = None,
) -> None:
    """Adds an audit row to the current transaction (committed with the change)."""
    db.add(AuditLog(
        actor_user_id=actor.id if actor else None,
        action=action,
        category=category,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        institution_id=institution_id or (actor.institution_id if actor else None),
        ip_address=(request.client.host if request and request.client else None),
        user_agent=(request.headers.get("user-agent", "")[:300] if request else None),
        details=details or {},
    ))
