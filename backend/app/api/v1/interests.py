from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends

from ...core.deps import DB, CurrentUser, require_permission
from ...core.permissions import P
from ...models import User
from ...schemas.learning import (
    ExploreIn,
    InterestHistoryOut,
    InterestOut,
    InterestsUpdate,
    QuestionnaireSubmit,
)
from ...services import interests as svc
from ...services.access import resolve_student, student_for_user

router = APIRouter(prefix="/interests", tags=["interests"])
self_manage = require_permission(P.INTERESTS_MANAGE_SELF)


@router.get("", response_model=list[InterestOut])
def current_interests(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    return svc.active_interests(db, s.id)


@router.put("/me", response_model=list[InterestOut])
def update_interests(data: InterestsUpdate, db: DB, user: User = Depends(self_manage)):
    """Students may change their interests at any time; every change is logged."""
    s = student_for_user(db, user)
    rows = svc.set_selections(db, s, data.selections, data.source)
    db.commit()
    return rows


@router.post("/me/explore", status_code=204)
def explore(data: ExploreIn, db: DB, user: User = Depends(self_manage)):
    svc.record_exploration(db, student_for_user(db, user), data.domain_id, data.subdomain_id)
    db.commit()


@router.get("/questionnaire")
def questionnaire(user: CurrentUser):
    # Strip internal domain mapping from the client payload.
    return {"version": svc.QUESTIONNAIRE["version"], "questions": [
        {"id": q["id"], "prompt": q["prompt"], "multi": q["multi"],
         "options": [{"id": o["id"], "label": o["label"]} for o in q["options"]]}
        for q in svc.QUESTIONNAIRE["questions"]]}


@router.post("/questionnaire")
def submit_questionnaire(data: QuestionnaireSubmit, db: DB, user: User = Depends(self_manage)):
    result = svc.score_questionnaire(db, student_for_user(db, user), data.answers)
    db.commit()
    return result


@router.get("/evolution")
def evolution(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    data = svc.evolution(db, s.id)
    data["timeline"] = [InterestHistoryOut.model_validate(h) for h in data["timeline"]]
    return data
