"""Recommendations, roadmaps, portfolios and achievements."""

from __future__ import annotations

import secrets
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Request
from pathfinder_engine.report_generation import build_roadmap
from sqlalchemy import select

from ...core.deps import DB, CurrentUser, require_permission
from ...core.errors import Forbidden, NotFound, ValidationFailed
from ...core.permissions import P, Role
from ...core.security import utcnow
from ...models import (
    Achievement,
    Activity,
    Domain,
    LearningResource,
    Portfolio,
    PortfolioItem,
    Recommendation,
    Roadmap,
    RoadmapMilestone,
    StoredFile,
    Student,
    StudentAchievement,
    Submission,
    User,
    WeeklyGoal,
    XPTransaction,
)
from ...schemas.common import Message
from ...schemas.growth import (
    AchievementOut,
    GamificationOut,
    MilestoneIn,
    MilestoneOut,
    MilestoneUpdate,
    PortfolioItemIn,
    PortfolioItemOut,
    PortfolioItemUpdate,
    PortfolioOut,
    PortfolioUpdate,
    RecommendationOut,
    RecommendationRespond,
    RecommendationReview,
    RecommendationSet,
    RoadmapGenerate,
    RoadmapOut,
    RoadmapReview,
    RoadmapUpdate,
)
from ...services import recommendations as rec_svc
from ...services.access import ensure_student_access, resolve_student, student_for_user
from ...services.audit import audit
from ...services.auth import age_on
from ...services.gamification import level_for_xp, record_learning_action, week_start
from ...services.interests import active_interests
from ...services.notify import notify, notify_guardians
from ...services.students import requires_guardian

router = APIRouter(tags=["growth"])

# ======================= recommendations =======================


@router.get("/recommendations", response_model=RecommendationSet)
def get_recommendations(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    return rec_svc.latest_set(db, s)


@router.post("/recommendations/generate", response_model=RecommendationSet)
def generate_recommendations(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    if user.role == Role.GUARDIAN:
        raise Forbidden("Guardians can view but not regenerate recommendations")
    rec_svc.generate(db, s)
    db.commit()
    return rec_svc.latest_set(db, s)


@router.post("/recommendations/{rec_id}/respond", response_model=RecommendationOut)
def respond(rec_id: uuid.UUID, data: RecommendationRespond, db: DB,
            user: User = Depends(require_permission(P.RECOMMENDATIONS_RESPOND))):
    s = student_for_user(db, user)
    r = db.get(Recommendation, rec_id)
    if r is None or r.student_id != s.id:
        raise NotFound("Recommendation not found")
    r.status, r.student_response = data.status, data.response
    if data.status == "disagreed":
        from ...models import ProgressEvent
        db.add(ProgressEvent(student_id=s.id, domain_id=r.domain_id, event_type="recommendation_disagreed",
                             source_type="recommendation", source_id=r.id, payload={"response": data.response}))
    db.commit()
    return rec_svc.decorate(db, [r])[0]


@router.post("/recommendations/{rec_id}/review", response_model=RecommendationOut)
def review(rec_id: uuid.UUID, data: RecommendationReview, db: DB,
           user: User = Depends(require_permission(P.RECOMMENDATIONS_REVIEW))):
    r = db.get(Recommendation, rec_id)
    if r is None:
        raise NotFound("Recommendation not found")
    s = ensure_student_access(db, user, r.student_id, write=True)
    r.mentor_review_status, r.mentor_note, r.reviewed_by = data.mentor_review_status, data.mentor_note, user.id
    if data.mentor_note:
        notify(db, s.user_id, "mentor_feedback", "Your mentor reviewed a suggestion", data.mentor_note[:200],
               "/app/recommendations")
    db.commit()
    return rec_svc.decorate(db, [r])[0]


# ======================= roadmaps =======================

def _roadmap_out(rm: Roadmap) -> RoadmapOut:
    out = RoadmapOut.model_validate(rm)
    total = len(rm.milestones) or 1
    out.progress_percent = round(100 * sum(m.status == "done" for m in rm.milestones) / total)
    out.milestones = []
    for m in rm.milestones:
        mo = MilestoneOut.model_validate(m)
        mo.due_date = rm.start_date + timedelta(days=m.due_day - 1)
        out.milestones.append(mo)
    return out


def _own_roadmap(db, user: User, roadmap_id: uuid.UUID, write: bool = False) -> Roadmap:
    rm = db.get(Roadmap, roadmap_id)
    if rm is None or rm.deleted_at is not None:
        raise NotFound("Roadmap not found")
    if write and user.role == Role.STUDENT:
        if student_for_user(db, user).id != rm.student_id:
            raise NotFound("Roadmap not found")
    else:
        ensure_student_access(db, user, rm.student_id)
    if write and user.role not in (Role.STUDENT,):
        raise Forbidden("Only the student can customise their roadmap")
    return rm


@router.get("/roadmaps", response_model=list[RoadmapOut])
def list_roadmaps(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    rows = db.scalars(select(Roadmap).where(Roadmap.student_id == s.id, Roadmap.deleted_at.is_(None))
                      .order_by(Roadmap.created_at.desc())).all()
    return [_roadmap_out(r) for r in rows]


@router.post("/roadmaps/generate", response_model=RoadmapOut, status_code=201)
def generate_roadmap(data: RoadmapGenerate, user: CurrentUser, db: DB):
    if user.role == Role.GUARDIAN:
        raise Forbidden("Guardians cannot create roadmaps")
    s = resolve_student(db, user, data.student_id)
    dom_ids = data.domain_ids or [i.domain_id for i in active_interests(db, s.id) if i.subdomain_id is None]
    if not dom_ids:
        raise ValidationFailed("Choose at least one domain (or select interests first)")
    domains = db.scalars(select(Domain).where(Domain.id.in_(dom_ids))).all()
    age = age_on(s.date_of_birth)
    done = set(db.scalars(select(Submission.activity_id).where(Submission.student_id == s.id)).all())
    per_domain = {7: 2, 30: 3, 90: 5, 180: 8}[data.horizon_days]
    acts: list[dict] = []
    for d in domains:
        pool = db.scalars(select(Activity).where(Activity.domain_id == d.id, Activity.status == "published",
                                                 Activity.deleted_at.is_(None), Activity.min_age <= age,
                                                 Activity.max_age >= age).order_by(Activity.difficulty)).all()
        pool = [a for a in pool if a.id not in done][:per_domain]
        acts += [{"id": str(a.id), "title": a.title, "domain_id": str(a.domain_id), "difficulty": a.difficulty} for a in pool]
    res = db.scalars(select(LearningResource).where(LearningResource.domain_id.in_(dom_ids),
                                                    LearningResource.deleted_at.is_(None),
                                                    LearningResource.min_age <= age, LearningResource.max_age >= age)).all()
    plan = build_roadmap(data.horizon_days, [{"id": str(d.id), "name": d.name} for d in domains], acts,
                         [{"title": r.title, "url": r.url, "domain_id": str(r.domain_id)} for r in res])
    rm = Roadmap(student_id=s.id, horizon_days=data.horizon_days, title=plan["title"][:200], objectives=plan["objectives"],
                 domain_ids=[str(d.id) for d in domains], start_date=date.today(), generated_by="engine")
    for m in plan["milestones"]:
        rm.milestones.append(RoadmapMilestone(
            title=m["title"][:200], description=m.get("description"), kind=m["kind"],
            activity_id=uuid.UUID(m["activity_id"]) if m.get("activity_id") else None,
            resource_url=m.get("resource_url"), due_day=m["due_day"], sort_order=m["sort_order"]))
    db.add(rm)
    db.commit()
    return _roadmap_out(rm)


@router.get("/roadmaps/{roadmap_id}", response_model=RoadmapOut)
def get_roadmap(roadmap_id: uuid.UUID, user: CurrentUser, db: DB):
    return _roadmap_out(_own_roadmap(db, user, roadmap_id))


@router.patch("/roadmaps/{roadmap_id}", response_model=RoadmapOut)
def update_roadmap(roadmap_id: uuid.UUID, data: RoadmapUpdate, user: CurrentUser, db: DB):
    rm = _own_roadmap(db, user, roadmap_id, write=True)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(rm, k, v)
    db.commit()
    return _roadmap_out(rm)


@router.delete("/roadmaps/{roadmap_id}", response_model=Message)
def delete_roadmap(roadmap_id: uuid.UUID, user: CurrentUser, db: DB):
    rm = _own_roadmap(db, user, roadmap_id, write=True)
    rm.deleted_at, rm.status = utcnow(), "archived"
    db.commit()
    return Message(message="Roadmap archived")


@router.post("/roadmaps/{roadmap_id}/milestones", response_model=RoadmapOut, status_code=201)
def add_milestone(roadmap_id: uuid.UUID, data: MilestoneIn, user: CurrentUser, db: DB):
    rm = _own_roadmap(db, user, roadmap_id, write=True)
    if data.due_day > rm.horizon_days:
        raise ValidationFailed(f"due_day must be within the {rm.horizon_days}-day plan")
    rm.milestones.append(RoadmapMilestone(title=data.title, description=data.description, kind="custom", is_custom=True,
                                          due_day=data.due_day, resource_url=str(data.resource_url) if data.resource_url else None,
                                          sort_order=len(rm.milestones)))
    db.commit()
    db.refresh(rm)
    return _roadmap_out(rm)


@router.patch("/roadmaps/milestones/{milestone_id}", response_model=RoadmapOut)
def update_milestone(milestone_id: uuid.UUID, data: MilestoneUpdate, user: CurrentUser, db: DB):
    m = db.get(RoadmapMilestone, milestone_id)
    if m is None:
        raise NotFound("Milestone not found")
    rm = _own_roadmap(db, user, m.roadmap_id, write=True)
    changes = data.model_dump(exclude_unset=True)
    if "due_day" in changes and changes["due_day"] > rm.horizon_days:
        raise ValidationFailed(f"due_day must be within the {rm.horizon_days}-day plan")
    newly_done = changes.get("status") == "done" and m.status != "done"
    for k, v in changes.items():
        setattr(m, k, v)
    if newly_done:
        m.completed_at = utcnow()
        s = db.get(Student, rm.student_id)
        from ...models import ProgressEvent
        db.add(ProgressEvent(student_id=s.id, event_type="milestone_reached", source_type="roadmap_milestone",
                             source_id=m.id, payload={"title": m.title, "roadmap_id": str(rm.id)}))
        record_learning_action(db, s, xp=15, reason=f"Milestone: {m.title}", goal_kind=None,
                               source_type="roadmap_milestone", source_id=m.id)
    elif changes.get("status") in ("pending", "skipped"):
        m.completed_at = None
    if all(x.status in ("done", "skipped") for x in rm.milestones):
        rm.status = "completed"
    db.commit()
    db.refresh(rm)
    return _roadmap_out(rm)


@router.delete("/roadmaps/milestones/{milestone_id}", response_model=RoadmapOut)
def delete_milestone(milestone_id: uuid.UUID, user: CurrentUser, db: DB):
    m = db.get(RoadmapMilestone, milestone_id)
    if m is None:
        raise NotFound("Milestone not found")
    rm = _own_roadmap(db, user, m.roadmap_id, write=True)
    if not m.is_custom:
        raise ValidationFailed("Generated milestones can be skipped but not deleted")
    db.delete(m)
    db.commit()
    db.refresh(rm)
    return _roadmap_out(rm)


@router.post("/roadmaps/{roadmap_id}/review", response_model=RoadmapOut)
def review_roadmap(roadmap_id: uuid.UUID, data: RoadmapReview, db: DB,
                   user: User = Depends(require_permission(P.RECOMMENDATIONS_REVIEW))):
    rm = db.get(Roadmap, roadmap_id)
    if rm is None or rm.deleted_at is not None:
        raise NotFound("Roadmap not found")
    s = ensure_student_access(db, user, rm.student_id, write=True)
    rm.mentor_review_status, rm.mentor_note = data.mentor_review_status, data.mentor_note
    notify(db, s.user_id, "mentor_feedback", "Your mentor reviewed your roadmap", data.mentor_note, f"/app/roadmap/{rm.id}")
    db.commit()
    return _roadmap_out(rm)


# ======================= portfolio =======================

def _portfolio_out(db, p: Portfolio, viewer: User | None) -> PortfolioOut:
    s = db.get(Student, p.student_id)
    out = PortfolioOut.model_validate(p)
    out.student_name = s.user.full_name
    out.sharing_requires_guardian = requires_guardian(s)
    items = [i for i in p.items if i.deleted_at is None]
    files = {f.id: f for f in db.scalars(select(StoredFile).where(
        StoredFile.id.in_([i.file_id for i in items if i.file_id]))).all()} if items else {}
    out.items = []
    for i in sorted(items, key=lambda x: (not x.is_featured, x.created_on), reverse=False):
        io = PortfolioItemOut.model_validate(i)
        f = files.get(i.file_id) if i.file_id else None
        io.file_name, io.file_content_type = (f.original_name, f.content_type) if f else (None, None)
        out.items.append(io)
    if viewer is None or viewer.role not in (Role.STUDENT, Role.GUARDIAN):
        out.share_token = None if viewer is None else out.share_token
    return out


def _portfolio_for(db, user: User, student_id: uuid.UUID | None) -> Portfolio:
    s = resolve_student(db, user, student_id)
    if user.role == Role.GUARDIAN or user.role in (Role.MENTOR, Role.TEACHER):
        pass  # access already verified by resolve_student (private-by-default applies to the public only)
    p = db.scalar(select(Portfolio).where(Portfolio.student_id == s.id))
    if p is None:
        p = Portfolio(student_id=s.id, title=f"{s.user.first_name}'s Portfolio")
        db.add(p)
        db.flush()
    return p


@router.get("/portfolios", response_model=PortfolioOut)
def get_portfolio(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    p = _portfolio_for(db, user, student_id)
    db.commit()
    return _portfolio_out(db, p, user)


@router.patch("/portfolios/me", response_model=PortfolioOut)
def update_portfolio(data: PortfolioUpdate, request: Request, db: DB,
                     user: User = Depends(require_permission(P.PORTFOLIO_MANAGE_SELF))):
    p = _portfolio_for(db, user, None)
    s = db.get(Student, p.student_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("visibility") == "link":
        if requires_guardian(s) and not p.guardian_approved_sharing:
            raise Forbidden("A guardian must approve link sharing first", code="guardian_approval_required")
        p.share_token = p.share_token or secrets.token_urlsafe(24)
    elif "visibility" in changes:
        p.share_token = None
    for k, v in changes.items():
        setattr(p, k, v)
    audit(db, "portfolio.updated", actor=user, entity_type="portfolio", entity_id=p.id, request=request,
          details={"visibility": p.visibility})
    db.commit()
    return _portfolio_out(db, p, user)


@router.post("/portfolios/me/items", response_model=PortfolioItemOut, status_code=201)
def add_item(data: PortfolioItemIn, db: DB, user: User = Depends(require_permission(P.PORTFOLIO_MANAGE_SELF))):
    p = _portfolio_for(db, user, None)
    if data.file_id:
        f = db.get(StoredFile, data.file_id)
        if f is None or f.owner_user_id != user.id:
            raise Forbidden("You can only attach your own files")
    if data.submission_id:
        sub = db.get(Submission, data.submission_id)
        if sub is None or sub.student_id != p.student_id:
            raise Forbidden("Not your submission")
    item = PortfolioItem(portfolio_id=p.id, title=data.title, description=data.description, category=data.category,
                         domain_ids=[str(d) for d in data.domain_ids], file_id=data.file_id,
                         external_url=str(data.external_url) if data.external_url else None,
                         submission_id=data.submission_id, created_on=data.created_on or date.today(),
                         is_featured=data.is_featured)
    db.add(item)
    db.commit()
    return item


@router.patch("/portfolios/me/items/{item_id}", response_model=PortfolioItemOut)
def update_item(item_id: uuid.UUID, data: PortfolioItemUpdate, db: DB,
                user: User = Depends(require_permission(P.PORTFOLIO_MANAGE_SELF))):
    p = _portfolio_for(db, user, None)
    item = db.get(PortfolioItem, item_id)
    if item is None or item.portfolio_id != p.id or item.deleted_at is not None:
        raise NotFound("Item not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(item, k, [str(x) for x in v] if k == "domain_ids" else v)
    db.commit()
    return item


@router.delete("/portfolios/me/items/{item_id}", response_model=Message)
def delete_item(item_id: uuid.UUID, db: DB, user: User = Depends(require_permission(P.PORTFOLIO_MANAGE_SELF))):
    p = _portfolio_for(db, user, None)
    item = db.get(PortfolioItem, item_id)
    if item is None or item.portfolio_id != p.id or item.deleted_at is not None:
        raise NotFound("Item not found")
    item.deleted_at = utcnow()
    db.commit()
    return Message(message="Item removed")


@router.get("/portfolios/export")
def export_portfolio(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    p = _portfolio_for(db, user, student_id)
    out = _portfolio_out(db, p, user).model_dump(mode="json")
    out["exported_at"] = utcnow().isoformat()
    out["format"] = "pathfinder-portfolio/v1"
    return out


@router.post("/portfolios/{student_id}/guardian-approval", response_model=PortfolioOut)
def guardian_approve_sharing(student_id: uuid.UUID, approved: bool, request: Request, db: DB,
                             user: User = Depends(require_permission(P.CONSENT_MANAGE))):
    ensure_student_access(db, user, student_id)
    p = db.scalar(select(Portfolio).where(Portfolio.student_id == student_id))
    if p is None:
        raise NotFound("Portfolio not found")
    p.guardian_approved_sharing = approved
    if not approved and p.visibility == "link":
        p.visibility, p.share_token = "guardians", None
    audit(db, "portfolio.guardian_sharing", actor=user, entity_type="portfolio", entity_id=p.id, request=request,
          details={"approved": approved})
    s = db.get(Student, student_id)
    notify(db, s.user_id, "portfolio", "Portfolio sharing " + ("approved" if approved else "turned off") + " by your guardian")
    db.commit()
    return _portfolio_out(db, p, user)


@router.get("/portfolios/shared/{token}", response_model=PortfolioOut)
def shared_portfolio(token: str, db: DB):
    """Public, read-only view. Only works when visibility == link and (for minors) a guardian approved."""
    p = db.scalar(select(Portfolio).where(Portfolio.share_token == token))
    if p is None or p.visibility != "link":
        raise NotFound("Portfolio not found")
    s = db.get(Student, p.student_id)
    if requires_guardian(s) and not p.guardian_approved_sharing:
        raise NotFound("Portfolio not found")
    out = _portfolio_out(db, p, None)
    out.student_name = s.user.first_name  # minimise personal data on public pages
    return out


# ======================= achievements =======================

@router.get("/achievements", response_model=GamificationOut)
def achievements(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    earned = {a.achievement_id: a for a in db.scalars(select(StudentAchievement).where(StudentAchievement.student_id == s.id)).all()}
    catalog = db.scalars(select(Achievement).order_by(Achievement.category, Achievement.xp_reward)).all()
    level, into, need = level_for_xp(s.xp)
    xp_rows = db.scalars(select(XPTransaction).where(XPTransaction.student_id == s.id)
                         .order_by(XPTransaction.created_at.desc()).limit(15)).all()
    goals = db.scalars(select(WeeklyGoal).where(WeeklyGoal.student_id == s.id, WeeklyGoal.week_start == week_start())).all()
    items = []
    for a in catalog:
        o = AchievementOut.model_validate(a)
        if a.id in earned:
            o.earned, o.awarded_at = True, earned[a.id].awarded_at
        items.append(o)
    return GamificationOut(
        xp=s.xp, level=level, xp_into_level=into, xp_for_next_level=need, current_streak=s.current_streak,
        longest_streak=s.longest_streak, achievements=items,
        recent_xp=[{"amount": x.amount, "reason": x.reason, "at": x.created_at.isoformat()} for x in xp_rows],
        weekly_goals=goals)


_ = notify_guardians  # used by other routers; keep import for clarity
