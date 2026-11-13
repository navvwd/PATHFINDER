from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ...ai import service as ai
from ...ai.providers import get_provider
from ...core.deps import DB, CurrentUser, require_permission
from ...core.errors import Forbidden
from ...core.permissions import P, Role
from ...models import User
from ...services.access import resolve_student

router = APIRouter(prefix="/ai", tags=["ai"])
use_ai = require_permission(P.AI_USE)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    student_id: uuid.UUID | None = None


class StudentTarget(BaseModel):
    student_id: uuid.UUID | None = None


class ProjectIdeasIn(StudentTarget):
    domain_id: uuid.UUID


def _student_only(user: User) -> None:
    if user.role == Role.GUARDIAN:
        raise Forbidden("This AI feature is for students and mentors")


@router.get("/status")
def status(db: DB, user: CurrentUser):
    provider = get_provider(ai.ai_settings(db))
    return {"llm_enabled": provider is not None, "provider": provider.name if provider else "engine",
            "model": getattr(provider, "model", None), "fallback": "deterministic engine",
            "notice": "AI guidance is always labelled and grounded in recorded activities. It never diagnoses or labels students."}


@router.post("/chat")
def chat(data: ChatIn, db: DB, user: User = Depends(use_ai)):
    _student_only(user)
    s = resolve_student(db, user, data.student_id)
    out = ai.chat(db, user, s, data.message)
    db.commit()
    return out


@router.post("/summary")
def summary(data: StudentTarget, db: DB, user: User = Depends(use_ai)):
    s = resolve_student(db, user, data.student_id)
    out = ai.summarize(db, user, s)
    db.commit()
    return out


@router.post("/project-ideas")
def project_ideas(data: ProjectIdeasIn, db: DB, user: User = Depends(use_ai)):
    _student_only(user)
    s = resolve_student(db, user, data.student_id)
    out = ai.project_ideas(db, user, s, data.domain_id)
    db.commit()
    return out


@router.post("/interest-analysis")
def interest_analysis(data: StudentTarget, db: DB, user: User = Depends(use_ai)):
    s = resolve_student(db, user, data.student_id)
    out = ai.interest_analysis(db, user, s)
    db.commit()
    return out


@router.post("/skill-suggestions")
def skill_suggestions(data: StudentTarget, db: DB, user: User = Depends(use_ai)):
    _student_only(user)
    s = resolve_student(db, user, data.student_id)
    out = ai.skill_suggestions(db, user, s)
    db.commit()
    return out


@router.post("/parent-report")
def parent_report(data: StudentTarget, db: DB, user: User = Depends(use_ai)):
    s = resolve_student(db, user, data.student_id)
    out = ai.parent_report(db, user, s)
    db.commit()
    return out


@router.post("/mentor-insights")
def mentor_insights(data: StudentTarget, db: DB, user: User = Depends(require_permission(P.STUDENTS_VIEW_ASSIGNED))):
    s = resolve_student(db, user, data.student_id)
    out = ai.mentor_insights(db, user, s)
    db.commit()
    return out
