from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select

from ...core.deps import DB, CurrentUser, Paging, is_global, require_permission
from ...core.errors import Forbidden, NotFound
from ...core.permissions import P, Role
from ...core.security import utcnow
from ...models import Assessment, AssessmentAttempt, Question, User
from ...repositories.base import paginate, tenant_filter
from ...schemas.common import Message, Page
from ...schemas.learning import (
    AnswersIn,
    AssessmentIn,
    AssessmentManageOut,
    AssessmentOut,
    AssessmentUpdate,
    AttemptOut,
    QuestionIn,
    QuestionManageOut,
)
from ...services import assessments as svc
from ...services.access import ensure_student_access, student_for_user
from ...services.audit import audit
from ...services.auth import age_on

router = APIRouter(prefix="/assessments", tags=["assessments"])
manage = require_permission(P.ASSESSMENTS_MANAGE)


def _get(db, user: User, assessment_id: uuid.UUID) -> Assessment:
    a = db.get(Assessment, assessment_id)
    if a is None or a.deleted_at is not None:
        raise NotFound("Assessment not found")
    if a.institution_id and not is_global(user) and a.institution_id != user.institution_id:
        raise NotFound("Assessment not found")
    return a


def _manage_out(a: Assessment) -> AssessmentManageOut:
    out = AssessmentManageOut(**svc.assessment_out(a).model_dump())
    out.questions = [QuestionManageOut.model_validate(q) for q in a.questions]
    return out


@router.get("", response_model=Page[AssessmentOut])
def list_assessments(user: CurrentUser, db: DB, paging: Paging, domain_id: uuid.UUID | None = None,
                     type: str | None = Query(None, max_length=30)):
    stmt = tenant_filter(select(Assessment).where(Assessment.deleted_at.is_(None)), Assessment, user)
    student = None
    if user.role == Role.STUDENT:
        student = student_for_user(db, user)
        age = age_on(student.date_of_birth)
        stmt = stmt.where(Assessment.status == "published", Assessment.min_age <= age, Assessment.max_age >= age)
    if domain_id:
        stmt = stmt.where(Assessment.domain_id == domain_id)
    if type:
        stmt = stmt.where(Assessment.type == type)
    if paging.q:
        stmt = stmt.where(Assessment.title.ilike(f"%{paging.q}%"))
    if not paging.sort:
        stmt = stmt.order_by(Assessment.difficulty, Assessment.title)
    page = paginate(db, stmt, paging, Assessment, {"title", "difficulty", "created_at"})
    attempts, best = {}, {}
    if student:
        rows = db.execute(select(AssessmentAttempt.assessment_id, func.count(), func.max(AssessmentAttempt.normalized_score))
                          .where(AssessmentAttempt.student_id == student.id)
                          .group_by(AssessmentAttempt.assessment_id)).all()
        attempts = {r[0]: r[1] for r in rows}
        best = {r[0]: r[2] for r in rows}
    page["items"] = [svc.assessment_out(a, attempts.get(a.id, 0) if student else None, best.get(a.id))
                     for a in page["items"]]
    return page


@router.get("/attempts", response_model=list[AttemptOut])
def my_attempts(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None, assessment_id: uuid.UUID | None = None):
    if student_id:
        s = ensure_student_access(db, user, student_id)
    else:
        s = student_for_user(db, user)
    stmt = select(AssessmentAttempt).where(AssessmentAttempt.student_id == s.id)
    if assessment_id:
        stmt = stmt.where(AssessmentAttempt.assessment_id == assessment_id)
    rows = db.scalars(stmt.order_by(AssessmentAttempt.started_at.desc()).limit(100)).all()
    out = []
    for r in rows:
        o = AttemptOut.model_validate(r, from_attributes=True)
        o.assessment_title = r.assessment.title
        out.append(o)
    return out


@router.get("/attempts/pending-review", response_model=list[AttemptOut])
def pending_review(db: DB, user: User = Depends(require_permission(P.SUBMISSIONS_EVALUATE))):
    from ...services.access import accessible_student_ids

    allowed = accessible_student_ids(db, user)
    stmt = select(AssessmentAttempt).where(AssessmentAttempt.status == "pending_review")
    if allowed is not None:
        stmt = stmt.where(AssessmentAttempt.student_id.in_(allowed or [uuid.uuid4()]))
    return [svc.attempt_out(db, a, reveal=True) for a in db.scalars(stmt.order_by(AssessmentAttempt.submitted_at)).all()]


@router.get("/attempts/{attempt_id}", response_model=AttemptOut)
def get_attempt(attempt_id: uuid.UUID, user: CurrentUser, db: DB):
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None:
        raise NotFound("Attempt not found")
    ensure_student_access(db, user, attempt.student_id)
    return svc.attempt_out(db, attempt, reveal=True)


@router.put("/attempts/{attempt_id}/responses", response_model=AttemptOut)
def save_responses(attempt_id: uuid.UUID, data: AnswersIn, user: CurrentUser, db: DB):
    s = student_for_user(db, user)
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None or attempt.student_id != s.id:
        raise NotFound("Attempt not found")
    svc.save_answers(db, attempt, data.answers)
    db.commit()
    return svc.attempt_out(db, attempt, reveal=False)


@router.post("/attempts/{attempt_id}/submit", response_model=AttemptOut)
def submit_attempt(attempt_id: uuid.UUID, user: CurrentUser, db: DB, data: AnswersIn | None = None):
    s = student_for_user(db, user)
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None or attempt.student_id != s.id:
        raise NotFound("Attempt not found")
    if data and data.answers:
        if attempt.expires_at is None or utcnow() <= attempt.expires_at + svc.GRACE:
            svc.save_answers(db, attempt, data.answers)
    svc.finalize_attempt(db, s, attempt)
    db.commit()
    db.refresh(attempt)
    return svc.attempt_out(db, attempt, reveal=True)


@router.get("/{assessment_id}")
def get_assessment(assessment_id: uuid.UUID, user: CurrentUser, db: DB):
    a = _get(db, user, assessment_id)
    if user.role in (Role.STUDENT, Role.GUARDIAN):
        if a.status != "published":
            raise NotFound("Assessment not found")
        return svc.assessment_out(a)  # never exposes answers
    return _manage_out(a)


@router.post("", response_model=AssessmentManageOut, status_code=201)
def create_assessment(data: AssessmentIn, request: Request, db: DB, user: User = Depends(manage)):
    payload = data.model_dump(exclude={"questions"})
    slug = re.sub(r"[^a-z0-9]+", "-", data.title.lower()).strip("-")[:50]
    a = Assessment(**payload, created_by=user.id, institution_id=None if is_global(user) else user.institution_id,
                   scale_key=f"{slug}-{uuid.uuid4().hex[:8]}")
    for i, q in enumerate(data.questions):
        a.questions.append(Question(**{**q.model_dump(), "sort_order": q.sort_order or i}))
    db.add(a)
    audit(db, "assessment.created", actor=user, entity_type="assessment", entity_id=a.id, request=request)
    db.commit()
    return _manage_out(a)


@router.patch("/{assessment_id}", response_model=AssessmentManageOut)
def update_assessment(assessment_id: uuid.UUID, data: AssessmentUpdate, db: DB, user: User = Depends(manage)):
    a = _get(db, user, assessment_id)
    if a.institution_id is None and not is_global(user):
        raise Forbidden("Platform assessments can only be edited by platform administrators")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    db.commit()
    return _manage_out(a)


@router.post("/{assessment_id}/questions", response_model=QuestionManageOut, status_code=201)
def add_question(assessment_id: uuid.UUID, data: QuestionIn, db: DB, user: User = Depends(manage)):
    a = _get(db, user, assessment_id)
    if a.institution_id is None and not is_global(user):
        raise Forbidden("Platform assessments can only be edited by platform administrators")
    q = Question(assessment_id=a.id, **{**data.model_dump(), "sort_order": data.sort_order or len(a.questions)})
    db.add(q)
    db.commit()
    return q


@router.delete("/{assessment_id}", response_model=Message)
def archive_assessment(assessment_id: uuid.UUID, db: DB, user: User = Depends(manage)):
    a = _get(db, user, assessment_id)
    if a.institution_id is None and not is_global(user):
        raise Forbidden("Platform assessments can only be edited by platform administrators")
    a.deleted_at, a.status = utcnow(), "archived"
    db.commit()
    return Message(message="Assessment archived (attempt history is kept)")


@router.post("/{assessment_id}/attempts", response_model=AttemptOut, status_code=201)
def start_attempt(assessment_id: uuid.UUID, db: DB, user: User = Depends(require_permission(P.ASSESSMENTS_TAKE))):
    s = student_for_user(db, user)
    a = _get(db, user, assessment_id)
    attempt = svc.start_attempt(db, s, a)
    db.commit()
    return svc.attempt_out(db, attempt, reveal=False)
