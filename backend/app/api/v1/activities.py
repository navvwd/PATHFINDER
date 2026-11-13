from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import or_, select

from ...core.deps import DB, CurrentUser, Paging, is_global, require_permission
from ...core.errors import Forbidden, NotFound
from ...core.permissions import P, Role
from ...core.security import utcnow
from ...models import Activity, ActivityAssignment, Batch, EvaluationRubric, Portfolio, PortfolioItem, StoredFile, Submission, User
from ...repositories.base import paginate, tenant_filter
from ...schemas.common import Message, Page
from ...schemas.learning import (
    ActivityIn,
    ActivityOut,
    ActivityUpdate,
    AssignIn,
    AssignmentOut,
    AttemptEvaluationIn,
    EvaluationOut,
    FileOut,
    RubricIn,
    RubricOut,
    SubmissionEvaluationIn,
    SubmissionIn,
    SubmissionOut,
)
from ...services import activities as svc
from ...services.access import accessible_student_ids, ensure_student_access, mentor_for_user, student_for_user
from ...services.assessments import evaluate_attempt_manually
from ...services.audit import audit
from ...services.auth import age_on
from ...services.storage import save_upload, storage

router = APIRouter(tags=["activities"])
manage = require_permission(P.ACTIVITIES_MANAGE)


def _get_activity(db, user: User, activity_id: uuid.UUID) -> Activity:
    a = db.get(Activity, activity_id)
    if a is None or a.deleted_at is not None:
        raise NotFound("Activity not found")
    if a.institution_id and not is_global(user) and a.institution_id != user.institution_id:
        raise NotFound("Activity not found")
    return a


def _can_edit(user: User, a: Activity) -> None:
    if is_global(user):
        return
    if a.institution_id is None:
        raise Forbidden("Platform activities can only be edited by platform administrators")
    if a.institution_id != user.institution_id:
        raise Forbidden("Not your institution's activity")


@router.get("/activities", response_model=Page[ActivityOut])
def list_activities(user: CurrentUser, db: DB, paging: Paging,
                    domain_id: uuid.UUID | None = None, subdomain_id: uuid.UUID | None = None,
                    category: str | None = Query(None, max_length=40), difficulty: int | None = Query(None, ge=1, le=5),
                    status: str | None = Query(None, pattern="^(draft|published|archived)$"),
                    eligible_only: bool = True):
    stmt = tenant_filter(select(Activity).where(Activity.deleted_at.is_(None)), Activity, user)
    student = None
    if user.role == Role.STUDENT:
        student = student_for_user(db, user)
        stmt = stmt.where(Activity.status == "published")
        if eligible_only:
            age = age_on(student.date_of_birth)
            stmt = stmt.where(Activity.min_age <= age, Activity.max_age >= age)
    elif status:
        stmt = stmt.where(Activity.status == status)
    if domain_id:
        stmt = stmt.where(Activity.domain_id == domain_id)
    if subdomain_id:
        stmt = stmt.where(Activity.subdomain_id == subdomain_id)
    if category:
        stmt = stmt.where(Activity.category == category)
    if difficulty:
        stmt = stmt.where(Activity.difficulty == difficulty)
    if paging.q:
        like = f"%{paging.q}%"
        stmt = stmt.where(or_(Activity.title.ilike(like), Activity.description.ilike(like)))
    if not paging.sort:
        stmt = stmt.order_by(Activity.difficulty, Activity.title)
    page = paginate(db, stmt, paging, Activity, {"title", "difficulty", "created_at", "estimated_minutes"})
    statuses, attempts = svc.student_activity_context(db, student.id) if student else ({}, {})
    page["items"] = [svc.activity_out(a, statuses.get(a.id), attempts.get(a.id)) for a in page["items"]]
    return page


@router.get("/activities/featured")
def featured_activities(db: DB, limit: int = Query(6, ge=1, le=12)):
    """Public showcase for the marketing site: one published platform activity per
    domain (no institution content, no student data)."""
    rows = db.scalars(select(Activity).where(Activity.status == "published", Activity.deleted_at.is_(None),
                                             Activity.institution_id.is_(None))
                      .order_by(Activity.difficulty.desc(), Activity.title)).all()
    seen, out = set(), []
    for a in rows:
        if a.domain_id in seen or a.difficulty < 2:
            continue
        seen.add(a.domain_id)
        out.append({"id": str(a.id), "title": a.title, "domain": a.domain.name, "domain_slug": a.domain.slug,
                    "category": a.category, "difficulty": a.difficulty, "estimated_minutes": a.estimated_minutes,
                    "min_age": a.min_age, "max_age": a.max_age,
                    "skills": a.domain.skill_categories[:2] + ([a.subdomain.name] if a.subdomain else [])})
        if len(out) >= limit:
            break
    return out


@router.get("/activities/assigned/me", response_model=list[AssignmentOut])
def my_assignments(user: CurrentUser, db: DB, status: str | None = Query(None, max_length=20)):
    s = student_for_user(db, user)
    stmt = select(ActivityAssignment).where(ActivityAssignment.student_id == s.id)
    if status:
        stmt = stmt.where(ActivityAssignment.status == status)
    rows = db.scalars(stmt.order_by(ActivityAssignment.created_at.desc())).all()
    out = []
    for r in rows:
        o = AssignmentOut.model_validate(r)
        o.activity = svc.activity_out(r.activity)
        out.append(o)
    return out


@router.get("/activities/{activity_id}", response_model=ActivityOut)
def get_activity(activity_id: uuid.UUID, user: CurrentUser, db: DB):
    a = _get_activity(db, user, activity_id)
    if user.role == Role.STUDENT:
        if a.status != "published":
            raise NotFound("Activity not found")
        s = student_for_user(db, user)
        statuses, attempts = svc.student_activity_context(db, s.id)
        return svc.activity_out(a, statuses.get(a.id), attempts.get(a.id))
    return svc.activity_out(a)


@router.post("/activities", response_model=ActivityOut, status_code=201)
def create_activity(data: ActivityIn, request: Request, db: DB, user: User = Depends(manage)):
    if data.rubric_id and db.get(EvaluationRubric, data.rubric_id) is None:
        raise NotFound("Rubric not found")
    a = Activity(**data.model_dump(), created_by=user.id,
                 institution_id=None if is_global(user) else user.institution_id)
    db.add(a)
    db.flush()
    audit(db, "activity.created", actor=user, entity_type="activity", entity_id=a.id, request=request)
    db.commit()
    return svc.activity_out(db.get(Activity, a.id))


@router.patch("/activities/{activity_id}", response_model=ActivityOut)
def update_activity(activity_id: uuid.UUID, data: ActivityUpdate, request: Request, db: DB, user: User = Depends(manage)):
    a = _get_activity(db, user, activity_id)
    _can_edit(user, a)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    if a.min_age > a.max_age:
        from ...core.errors import ValidationFailed
        raise ValidationFailed("min_age must be <= max_age")
    audit(db, "activity.updated", actor=user, entity_type="activity", entity_id=a.id, request=request,
          details={"fields": sorted(data.model_dump(exclude_unset=True))})
    db.commit()
    return svc.activity_out(a)


@router.delete("/activities/{activity_id}", response_model=Message)
def delete_activity(activity_id: uuid.UUID, request: Request, db: DB, user: User = Depends(manage)):
    a = _get_activity(db, user, activity_id)
    _can_edit(user, a)
    a.deleted_at, a.status = utcnow(), "archived"
    audit(db, "activity.archived", actor=user, entity_type="activity", entity_id=a.id, request=request)
    db.commit()
    return Message(message="Activity archived (submission history is kept)")


@router.post("/activities/{activity_id}/assign", response_model=list[AssignmentOut])
def assign_activity(activity_id: uuid.UUID, data: AssignIn, request: Request, db: DB,
                    user: User = Depends(require_permission(P.ACTIVITIES_ASSIGN))):
    a = _get_activity(db, user, activity_id)
    ids = list(data.student_ids)
    if data.batch_id:
        batch = db.get(Batch, data.batch_id)
        if batch is None or batch.deleted_at is not None:
            raise NotFound("Batch not found")
        if user.role in (Role.MENTOR, Role.TEACHER) and batch.mentor_id != mentor_for_user(db, user).id:
            raise Forbidden("You can only assign to your own batches")
        ids += svc.batch_student_ids(db, batch.id)
    allowed = accessible_student_ids(db, user)
    ids = list(dict.fromkeys(ids))
    if allowed is not None and not set(ids) <= allowed:
        raise Forbidden("Some students are not assigned to you")
    rows = svc.assign(db, a, ids, assigned_by=user, batch_id=data.batch_id, due_at=data.due_at, note=data.note)
    audit(db, "activity.assigned", actor=user, entity_type="activity", entity_id=a.id, request=request,
          details={"students": len(ids)})
    db.commit()
    return [AssignmentOut.model_validate(r) for r in rows]


# ---------------- files ----------------

@router.post("/files", response_model=FileOut, status_code=201)
async def upload_file(user: CurrentUser, db: DB, file: UploadFile = File(...)):
    row = await save_upload(db, user, file)
    db.commit()
    return row


@router.get("/files/{file_id}")
def download_file(file_id: uuid.UUID, user: CurrentUser, db: DB):
    f = db.get(StoredFile, file_id)
    if f is None or f.deleted_at is not None:
        raise NotFound("File not found")
    if f.owner_user_id != user.id:
        # Access is granted through the student who owns the file.
        from ...models import Student
        owner_student = db.scalar(select(Student).where(Student.user_id == f.owner_user_id))
        if owner_student is None:
            raise Forbidden("Not allowed")
        ensure_student_access(db, user, owner_student.id)
    path = storage().path(f.storage_key)
    if not path.exists():
        raise NotFound("File content missing")
    return FileResponse(path, media_type=f.content_type, filename=f.original_name,
                        headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=0"})


# ---------------- submissions ----------------

@router.post("/submissions", response_model=SubmissionOut, status_code=201)
def submit(data: SubmissionIn, request: Request, db: DB, user: User = Depends(require_permission(P.ACTIVITIES_SUBMIT))):
    s = student_for_user(db, user)
    sub = svc.create_submission(db, s, user, data)
    audit(db, "submission.created", actor=user, entity_type="submission", entity_id=sub.id, request=request)
    db.commit()
    return svc.submission_out(db, sub)


@router.get("/submissions", response_model=Page[SubmissionOut])
def list_submissions(user: CurrentUser, db: DB, paging: Paging, student_id: uuid.UUID | None = None,
                     activity_id: uuid.UUID | None = None, status: str | None = Query(None, max_length=20)):
    stmt = select(Submission)
    if user.role == Role.STUDENT:
        stmt = stmt.where(Submission.student_id == student_for_user(db, user).id)
    else:
        allowed = accessible_student_ids(db, user)
        if student_id:
            ensure_student_access(db, user, student_id)
            stmt = stmt.where(Submission.student_id == student_id)
        elif allowed is not None:
            stmt = stmt.where(Submission.student_id.in_(allowed or [uuid.uuid4()]))
    if activity_id:
        stmt = stmt.where(Submission.activity_id == activity_id)
    if status:
        stmt = stmt.where(Submission.status == status)
    stmt = stmt.order_by(Submission.submitted_at.desc())
    page = paginate(db, stmt, paging, Submission, {"submitted_at"})
    page["items"] = [svc.submission_out(db, s) for s in page["items"]]
    return page


@router.get("/submissions/{submission_id}", response_model=SubmissionOut)
def get_submission(submission_id: uuid.UUID, user: CurrentUser, db: DB):
    sub = db.get(Submission, submission_id)
    if sub is None:
        raise NotFound("Submission not found")
    ensure_student_access(db, user, sub.student_id)
    return svc.submission_out(db, sub)


@router.post("/submissions/{submission_id}/portfolio", response_model=Message, status_code=201)
def add_submission_to_portfolio(submission_id: uuid.UUID, user: CurrentUser, db: DB):
    sub = db.get(Submission, submission_id)
    s = student_for_user(db, user)
    if sub is None or sub.student_id != s.id:
        raise NotFound("Submission not found")
    portfolio = db.scalar(select(Portfolio).where(Portfolio.student_id == s.id))
    if db.scalar(select(PortfolioItem.id).where(PortfolioItem.submission_id == sub.id, PortfolioItem.deleted_at.is_(None))):
        return Message(message="Already in your portfolio")
    cat = {"coding_challenge": "coding_project", "research_task": "research_project",
           "creative_assignment": "creative_work"}.get(sub.activity.category, "document")
    db.add(PortfolioItem(portfolio_id=portfolio.id, title=sub.activity.title, description=sub.content_text[:1000] if sub.content_text else None,
                         category=cat, domain_ids=[str(sub.activity.domain_id)], submission_id=sub.id,
                         file_id=uuid.UUID(sub.file_ids[0]) if sub.file_ids else None, external_url=sub.link_url,
                         created_on=sub.submitted_at.date()))
    db.commit()
    return Message(message="Added to your portfolio")


# ---------------- evaluations ----------------

@router.post("/evaluations/submissions/{submission_id}", response_model=EvaluationOut, status_code=201)
def evaluate_submission(submission_id: uuid.UUID, data: SubmissionEvaluationIn, request: Request, db: DB,
                        user: User = Depends(require_permission(P.SUBMISSIONS_EVALUATE))):
    sub = db.get(Submission, submission_id)
    if sub is None:
        raise NotFound("Submission not found")
    ensure_student_access(db, user, sub.student_id, write=True)
    rec = svc.evaluate_submission(db, sub, user, data)
    audit(db, "submission.evaluated", actor=user, entity_type="submission", entity_id=sub.id, request=request,
          details={"score": rec.normalized_score})
    db.commit()
    return rec


@router.post("/evaluations/attempts/{attempt_id}", response_model=EvaluationOut, status_code=201)
def evaluate_attempt(attempt_id: uuid.UUID, data: AttemptEvaluationIn, request: Request, db: DB,
                     user: User = Depends(require_permission(P.SUBMISSIONS_EVALUATE))):
    rec = evaluate_attempt_manually(db, attempt_id, user, data)
    audit(db, "attempt.evaluated", actor=user, entity_type="assessment_attempt", entity_id=attempt_id, request=request)
    db.commit()
    return rec


@router.get("/evaluations/rubrics", response_model=list[RubricOut])
def list_rubrics(user: CurrentUser, db: DB, domain_id: uuid.UUID | None = None):
    stmt = tenant_filter(select(EvaluationRubric).where(EvaluationRubric.deleted_at.is_(None)), EvaluationRubric, user)
    if domain_id:
        stmt = stmt.where(or_(EvaluationRubric.domain_id == domain_id, EvaluationRubric.domain_id.is_(None)))
    return db.scalars(stmt.order_by(EvaluationRubric.title)).all()


@router.post("/evaluations/rubrics", response_model=RubricOut, status_code=201)
def create_rubric(data: RubricIn, db: DB, user: User = Depends(manage)):
    r = EvaluationRubric(title=data.title, domain_id=data.domain_id, criteria=[c.model_dump() for c in data.criteria],
                         created_by=user.id, institution_id=None if is_global(user) else user.institution_id)
    db.add(r)
    db.commit()
    return r
