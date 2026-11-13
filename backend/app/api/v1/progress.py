"""Progress, analytics and scoring-configuration endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select

from ...core.deps import DB, CurrentUser, Paging, require_permission
from ...core.errors import NotFound
from ...core.permissions import P
from ...models import (
    Activity,
    AssessmentAttempt,
    Domain,
    DomainScore,
    Institution,
    ProgressEvent,
    ProgressSnapshot,
    ScoringConfigVersion,
    Student,
    StudentInterest,
    Submission,
    User,
    WeeklyGoal,
)
from ...repositories.base import paginate
from ...schemas.common import Page
from ...schemas.growth import (
    DomainScoreOut,
    ProgressEventOut,
    ReflectionIn,
    ScoringConfigIn,
    ScoringConfigOut,
    WeeklyGoalIn,
    WeeklyGoalOut,
    WeeklyGoalUpdate,
)
from ...services import progress as svc
from ...services.access import resolve_student, student_for_user
from ...services.audit import audit
from ...services.gamification import ensure_default_goals, record_learning_action, week_start
from ...services.scoring import compute_scores, create_config_version, latest_scores

router = APIRouter(tags=["progress"])


def _score_out(db, rows: list[DomainScore]) -> list[DomainScoreOut]:
    names = {d.id: d for d in db.scalars(select(Domain)).all()}
    out = []
    for r in rows:
        o = DomainScoreOut.model_validate(r)
        if r.domain_id in names:
            o.domain_name, o.domain_color = names[r.domain_id].name, names[r.domain_id].color
        out.append(o)
    order = {d.id: d.sort_order for d in names.values()}
    return sorted(out, key=lambda o: order.get(o.domain_id, 99))


@router.get("/progress/summary")
def summary(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    if not latest_scores(db, s.id):
        compute_scores(db, s)
        db.commit()
    return svc.progress_summary(db, s)


@router.get("/progress/timeline")
def timeline(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None,
             period: str = Query("weekly", pattern="^(daily|weekly|monthly)$"), domain_id: uuid.UUID | None = None,
             days: int = Query(180, ge=7, le=730)):
    s = resolve_student(db, user, student_id)
    return svc.timeline(db, s, period, domain_id, days)


@router.get("/progress/events", response_model=Page[ProgressEventOut])
def events(user: CurrentUser, db: DB, paging: Paging, student_id: uuid.UUID | None = None,
           event_type: str | None = Query(None, max_length=40), domain_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    stmt = select(ProgressEvent).where(ProgressEvent.student_id == s.id)
    if event_type:
        stmt = stmt.where(ProgressEvent.event_type == event_type)
    if domain_id:
        stmt = stmt.where(ProgressEvent.domain_id == domain_id)
    return paginate(db, stmt.order_by(ProgressEvent.occurred_at.desc()), paging, ProgressEvent, set())


@router.post("/progress/reflections", response_model=ProgressEventOut, status_code=201)
def reflect(data: ReflectionIn, db: DB, user: User = Depends(require_permission(P.ACTIVITIES_SUBMIT))):
    s = student_for_user(db, user)
    ev = ProgressEvent(student_id=s.id, domain_id=data.domain_id, event_type="reflection", source_type="student",
                       payload={"text": data.text, "mood": data.mood})
    db.add(ev)
    db.flush()
    record_learning_action(db, s, xp=10, reason="Wrote a reflection", goal_kind=None, source_type="reflection",
                           source_id=ev.id)
    db.commit()
    return ev


@router.get("/progress/snapshots")
def snapshots(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None,
              period: str = Query("weekly", pattern="^(daily|weekly|monthly)$")):
    s = resolve_student(db, user, student_id)
    svc.snapshot(db, s, period)
    db.commit()
    rows = db.scalars(select(ProgressSnapshot).where(ProgressSnapshot.student_id == s.id, ProgressSnapshot.period == period)
                      .order_by(ProgressSnapshot.period_start.desc()).limit(26)).all()
    return [{"period_start": r.period_start.isoformat(), "metrics": r.metrics} for r in rows]


# ---------------- weekly goals ----------------

@router.get("/progress/goals", response_model=list[WeeklyGoalOut])
def goals(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    ensure_default_goals(db, s)
    db.commit()
    return db.scalars(select(WeeklyGoal).where(WeeklyGoal.student_id == s.id)
                      .order_by(WeeklyGoal.week_start.desc(), WeeklyGoal.created_at).limit(30)).all()


@router.post("/progress/goals", response_model=WeeklyGoalOut, status_code=201)
def add_goal(data: WeeklyGoalIn, db: DB, user: User = Depends(require_permission(P.ROADMAP_MANAGE_SELF))):
    s = student_for_user(db, user)
    g = WeeklyGoal(student_id=s.id, week_start=week_start(), **data.model_dump())
    db.add(g)
    db.commit()
    return g


@router.patch("/progress/goals/{goal_id}", response_model=WeeklyGoalOut)
def update_goal(goal_id: uuid.UUID, data: WeeklyGoalUpdate, db: DB,
                user: User = Depends(require_permission(P.ROADMAP_MANAGE_SELF))):
    s = student_for_user(db, user)
    g = db.get(WeeklyGoal, goal_id)
    if g is None or g.student_id != s.id:
        raise NotFound("Goal not found")
    if data.title is not None:
        g.title = data.title
    if data.target_count is not None:
        g.target_count = data.target_count
    if data.increment is not None and g.kind == "custom":
        g.current_count = max(0, g.current_count + data.increment)
    if g.current_count >= g.target_count and g.status == "active":
        g.status = "completed"
        record_learning_action(db, s, xp=40, reason=f"Weekly goal: {g.title}", goal_kind=None,
                               source_type="weekly_goal", source_id=g.id)
    db.commit()
    return g


# ---------------- analytics ----------------

@router.get("/analytics/domain-scores", response_model=list[DomainScoreOut])
def domain_scores(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    rows = latest_scores(db, s.id)
    if not rows:
        compute_scores(db, s)
        db.commit()
        rows = latest_scores(db, s.id)
    return _score_out(db, rows)


@router.get("/analytics/domain-scores/history", response_model=list[DomainScoreOut])
def domain_score_history(user: CurrentUser, db: DB, domain_id: uuid.UUID, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    rows = db.scalars(select(DomainScore).where(DomainScore.student_id == s.id, DomainScore.domain_id == domain_id)
                      .order_by(DomainScore.computed_at).limit(200)).all()
    return _score_out(db, list(rows))


@router.post("/analytics/recompute", response_model=list[DomainScoreOut])
def recompute(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    compute_scores(db, s)
    db.commit()
    return _score_out(db, latest_scores(db, s.id))


@router.get("/analytics/platform")
def platform_analytics(db: DB, user: User = Depends(require_permission(P.SYSTEM_MONITOR))):
    since = datetime.now(timezone.utc) - timedelta(days=30)
    by_role = dict(db.execute(select(User.role, func.count()).where(User.deleted_at.is_(None)).group_by(User.role)).all())
    domain_pop = db.execute(select(Domain.name, func.count(StudentInterest.id)).join(
        StudentInterest, (StudentInterest.domain_id == Domain.id) & StudentInterest.is_active.is_(True)
        & StudentInterest.subdomain_id.is_(None), isouter=True).group_by(Domain.name)).all()
    return {
        "users_by_role": by_role,
        "institutions": db.scalar(select(func.count()).select_from(Institution).where(Institution.deleted_at.is_(None))),
        "students": db.scalar(select(func.count()).select_from(Student).where(Student.deleted_at.is_(None))),
        "activities": db.scalar(select(func.count()).select_from(Activity).where(Activity.deleted_at.is_(None))),
        "submissions_30d": db.scalar(select(func.count()).select_from(Submission).where(Submission.submitted_at >= since)),
        "attempts_30d": db.scalar(select(func.count()).select_from(AssessmentAttempt).where(AssessmentAttempt.started_at >= since)),
        "active_students_30d": db.scalar(select(func.count(func.distinct(ProgressEvent.student_id))).where(
            ProgressEvent.occurred_at >= since)),
        "domain_interest": [{"domain": n, "students": c} for n, c in domain_pop],
    }


@router.get("/analytics/scoring-config", response_model=list[ScoringConfigOut])
def scoring_versions(db: DB, user: User = Depends(require_permission(P.SCORING_MANAGE))):
    return db.scalars(select(ScoringConfigVersion).order_by(ScoringConfigVersion.version.desc())).all()


@router.get("/analytics/scoring-config/active", response_model=ScoringConfigOut)
def scoring_active(user: CurrentUser, db: DB):
    row = db.scalar(select(ScoringConfigVersion).where(ScoringConfigVersion.is_active.is_(True)))
    if row is None:
        raise NotFound("No active scoring configuration")
    return row


@router.post("/analytics/scoring-config", response_model=ScoringConfigOut, status_code=201)
def new_scoring_version(data: ScoringConfigIn, request: Request, db: DB,
                        user: User = Depends(require_permission(P.SCORING_MANAGE))):
    row = create_config_version(db, data.weights, data.thresholds, data.note, user)
    audit(db, "scoring.config_changed", actor=user, entity_type="scoring_config", entity_id=row.version,
          category="admin", request=request, details={"weights": data.weights})
    db.commit()
    return row
