from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.errors import ValidationFailed
from ..core.security import utcnow
from ..models import (
    Activity,
    ActivityAssignment,
    AssessmentAttempt,
    Domain,
    Portfolio,
    PortfolioItem,
    ProgressEvent,
    Recommendation,
    Roadmap,
    RoadmapMilestone,
    Student,
    StudentAchievement,
    Submission,
    WeeklyGoal,
)
from ..schemas.student import AgeGroupOut, OnboardingStatus, OnboardingStep, StudentOut, StudentSummary
from . import interests as interest_svc
from .auth import age_group_for, age_on
from .gamification import ensure_default_goals, level_for_xp, week_start
from .scoring import latest_scores

ONBOARDING_STEPS = [
    ("account", "Create your account"),
    ("academic", "Academic profile"),
    ("interests", "Interest discovery"),
    ("goals", "Personal goals"),
    ("guardian", "Guardian verification"),
]


def requires_guardian(student: Student) -> bool:
    return age_on(student.date_of_birth) < get_settings().CONSENT_REQUIRED_UNDER_AGE


def student_out(s: Student) -> StudentOut:
    return StudentOut.model_validate({
        **{k: getattr(s, k) for k in StudentOut.model_fields if hasattr(s, k) and k not in ("age", "full_name", "email", "age_group")},
        "full_name": s.user.full_name, "email": s.user.email, "age": age_on(s.date_of_birth),
        "age_group": AgeGroupOut.model_validate(s.age_group) if s.age_group else None,
    })


def student_summary(s: Student) -> StudentSummary:
    return StudentSummary(id=s.id, full_name=s.user.full_name, age=age_on(s.date_of_birth),
                          age_group=s.age_group.label if s.age_group else None, grade=s.grade, school_name=s.school_name,
                          xp=s.xp, current_streak=s.current_streak, institution_id=s.institution_id,
                          onboarding_complete=s.onboarding_completed_at is not None)


def onboarding_status(s: Student) -> OnboardingStatus:
    done = set(s.onboarding_steps_completed or [])
    needs_guardian = requires_guardian(s)
    steps = [OnboardingStep(key=k, title=t, completed=k in done, required=(k != "guardian" or needs_guardian))
             for k, t in ONBOARDING_STEPS]
    required = [st for st in steps if st.required]
    pct = round(100 * sum(st.completed for st in required) / len(required))
    return OnboardingStatus(steps=steps, percent_complete=pct, completed=s.onboarding_completed_at is not None,
                            guardian_invite_code=s.guardian_invite_code, consent_status=s.consent_status,
                            requires_guardian_consent=needs_guardian)


def mark_step(s: Student, key: str) -> None:
    if key not in (s.onboarding_steps_completed or []):
        s.onboarding_steps_completed = [*(s.onboarding_steps_completed or []), key]


def save_academic(db: Session, s: Student, data) -> None:
    s.school_name, s.grade, s.class_name = data.school_name, data.grade, data.class_name
    s.educational_background = data.educational_background
    ag = age_group_for(db, s.date_of_birth)
    s.age_group_id = ag.id if ag else s.age_group_id
    mark_step(s, "academic")


def save_interests(db: Session, s: Student, data) -> None:
    from ..schemas.learning import InterestSelection

    if not data.domain_ids:
        raise ValidationFailed("Choose at least one domain you would like to explore")
    s.favourite_subjects, s.hobbies = data.favourite_subjects, data.hobbies
    s.personal_interests, s.extracurriculars = data.personal_interests, data.extracurriculars
    s.self_reported_strengths = data.self_reported_strengths
    sels = [InterestSelection(domain_id=d, strength=4, is_favourite=(d == data.favourite_domain_id)) for d in data.domain_ids]
    from ..models import Subdomain

    parents = dict(db.execute(select(Subdomain.id, Subdomain.domain_id).where(Subdomain.id.in_(data.subdomain_ids))).all()) \
        if data.subdomain_ids else {}
    for sub in data.subdomain_ids:
        if sub not in parents:
            raise ValidationFailed("Unknown subdomain")
        sels.append(InterestSelection(domain_id=parents[sub], subdomain_id=sub, strength=4))
    interest_svc.set_selections(db, s, sels, source="onboarding")
    mark_step(s, "interests")


def save_goals(s: Student, data) -> None:
    s.skills_to_learn, s.activities_enjoyed = data.skills_to_learn, data.activities_enjoyed
    s.aspirations, s.learning_preferences = data.aspirations, data.learning_preferences
    mark_step(s, "goals")


def complete_onboarding(db: Session, s: Student) -> OnboardingStatus:
    status = onboarding_status(s)
    missing = [st.title for st in status.steps if st.required and not st.completed and st.key != "guardian"]
    if missing:
        raise ValidationFailed("Please finish: " + ", ".join(missing), code="onboarding_incomplete")
    if requires_guardian(s) and "guardian" not in (s.onboarding_steps_completed or []):
        raise ValidationFailed("Share your guardian invite code first so a parent can give consent",
                               code="guardian_step_required")
    if s.onboarding_completed_at is None:
        s.onboarding_completed_at = utcnow()
        db.add(ProgressEvent(student_id=s.id, event_type="milestone_reached", source_type="onboarding",
                             payload={"title": "Completed onboarding"}))
    return onboarding_status(s)


def build_dashboard(db: Session, s: Student) -> dict:
    ensure_default_goals(db, s)
    db.flush()
    domains = {d.id: d for d in db.scalars(select(Domain).where(Domain.deleted_at.is_(None))).all()}
    scores = {sc.domain_id: sc for sc in latest_scores(db, s.id)}
    interests = [i for i in interest_svc.active_interests(db, s.id) if i.subdomain_id is None]
    selected = []
    for i in interests:
        d = domains.get(i.domain_id)
        if not d:
            continue
        sc = scores.get(d.id)
        selected.append({"domain_id": str(d.id), "name": d.name, "slug": d.slug, "color": d.color, "icon": d.icon,
                         "is_favourite": i.is_favourite, "strength": i.strength,
                         "skill_score": sc.skill_score if sc else None, "confidence_label": sc.confidence_label if sc else "none",
                         "evidence_count": sc.evidence_count if sc else 0})

    done_ids = set(db.scalars(select(Submission.activity_id).where(Submission.student_id == s.id)).all())
    age = age_on(s.date_of_birth)
    sel_ids = [uuid.UUID(x["domain_id"]) for x in selected] or list(domains)
    pool = db.scalars(select(Activity).where(Activity.domain_id.in_(sel_ids), Activity.status == "published",
                                             Activity.deleted_at.is_(None), Activity.min_age <= age, Activity.max_age >= age)
                      .order_by(Activity.difficulty, Activity.title)).all()
    pool = [a for a in pool if a.id not in done_ids]
    if not pool:
        # Everything in the chosen domains is done: invite exploration of other domains.
        pool = [a for a in db.scalars(select(Activity).where(
            Activity.status == "published", Activity.deleted_at.is_(None), Activity.min_age <= age,
            Activity.max_age >= age).order_by(Activity.difficulty, Activity.title)).all() if a.id not in done_ids]
    seed = date.today().toordinal()
    daily = [pool[(seed + k * 7) % len(pool)] for k in range(min(3, len(pool)))] if pool else []
    daily = list({a.id: a for a in daily}.values())

    pending = db.scalars(select(ActivityAssignment).where(ActivityAssignment.student_id == s.id,
                                                          ActivityAssignment.status.in_(("assigned", "in_progress")))
                         .order_by(ActivityAssignment.due_at.is_(None), ActivityAssignment.due_at).limit(5)).all()
    open_attempts = db.scalars(select(AssessmentAttempt).where(AssessmentAttempt.student_id == s.id,
                                                               AssessmentAttempt.status == "in_progress").limit(3)).all()
    achievements = db.scalars(select(StudentAchievement).where(StudentAchievement.student_id == s.id)
                              .order_by(StudentAchievement.awarded_at.desc()).limit(4)).all()

    since = datetime.now(timezone.utc) - timedelta(weeks=8)
    events = db.scalars(select(ProgressEvent).where(ProgressEvent.student_id == s.id, ProgressEvent.occurred_at >= since,
                                                    ProgressEvent.score_pct.is_not(None),
                                                    ProgressEvent.is_superseded.is_(False))).all()
    buckets: dict[date, list[float]] = {}
    for e in events:
        ws = e.occurred_at.date() - timedelta(days=e.occurred_at.weekday())
        buckets.setdefault(ws, []).append(e.score_pct)
    chart = [{"week": k.isoformat(), "average_score": round(sum(v) / len(v), 1), "count": len(v)}
             for k, v in sorted(buckets.items())]

    goals = db.scalars(select(WeeklyGoal).where(WeeklyGoal.student_id == s.id, WeeklyGoal.week_start == week_start())).all()
    portfolio = db.scalar(select(Portfolio).where(Portfolio.student_id == s.id))
    items = db.scalars(select(PortfolioItem).where(PortfolioItem.portfolio_id == portfolio.id, PortfolioItem.deleted_at.is_(None))
                       .order_by(PortfolioItem.is_featured.desc(), PortfolioItem.created_on.desc()).limit(3)).all() if portfolio else []
    recs = db.scalars(select(Recommendation).where(Recommendation.student_id == s.id, Recommendation.status == "active")
                      .order_by(Recommendation.priority).limit(4)).all()
    roadmap = db.scalar(select(Roadmap).where(Roadmap.student_id == s.id, Roadmap.status == "active",
                                              Roadmap.deleted_at.is_(None)).order_by(Roadmap.created_at.desc()))
    milestones = []
    if roadmap:
        for m in db.scalars(select(RoadmapMilestone).where(RoadmapMilestone.roadmap_id == roadmap.id,
                                                           RoadmapMilestone.status == "pending")
                            .order_by(RoadmapMilestone.sort_order).limit(3)).all():
            milestones.append({"id": str(m.id), "title": m.title, "kind": m.kind, "roadmap_id": str(roadmap.id),
                               "due_date": (roadmap.start_date + timedelta(days=m.due_day - 1)).isoformat()})

    completed_acts = db.scalar(select(func.count()).select_from(Submission).where(Submission.student_id == s.id)) or 0
    completed_assess = db.scalar(select(func.count()).select_from(AssessmentAttempt).where(
        AssessmentAttempt.student_id == s.id, AssessmentAttempt.status == "evaluated")) or 0
    level, into, need = level_for_xp(s.xp)
    hour = datetime.now().hour
    part = "morning" if hour < 12 else "afternoon" if hour < 17 else "evening"
    junior = bool(s.age_group and s.age_group.ui_mode == "junior")

    def act(a: Activity) -> dict:
        return {"id": str(a.id), "title": a.title, "domain_id": str(a.domain_id), "domain_name": a.domain.name,
                "domain_color": a.domain.color, "difficulty": a.difficulty, "estimated_minutes": a.estimated_minutes,
                "category": a.category, "xp_reward": a.xp_reward}

    return {
        "student": student_summary(s),
        "greeting": f"Good {part}, {s.user.first_name}!" + (" Ready for an adventure?" if junior else ""),
        "ui_mode": "junior" if junior else "senior",
        "selected_domains": selected,
        "daily_activities": [act(a) for a in daily],
        "pending_challenges": (
            [{"type": "activity", "assignment_id": str(p.id), "status": p.status,
              "due_at": p.due_at.isoformat() if p.due_at else None, **act(p.activity)} for p in pending]
            + [{"type": "assessment", "attempt_id": str(t.id), "id": str(t.assessment_id), "title": t.assessment.title,
                "expires_at": t.expires_at.isoformat() if t.expires_at else None} for t in open_attempts]),
        "recent_achievements": [{"title": a.achievement.title, "icon": a.achievement.icon,
                                 "awarded_at": a.awarded_at.isoformat()} for a in achievements],
        "progress_chart": chart,
        "weekly_goals": [{"id": str(g.id), "title": g.title, "current": g.current_count, "target": g.target_count,
                          "status": g.status} for g in goals],
        "portfolio_highlights": [{"id": str(i.id), "title": i.title, "category": i.category,
                                  "created_on": i.created_on.isoformat()} for i in items],
        "recommendations": [{"id": str(r.id), "kind": r.kind, "title": r.title, "reasons": r.reasons,
                             "activity_id": str(r.activity_id) if r.activity_id else None,
                             "domain_id": str(r.domain_id) if r.domain_id else None} for r in recs],
        "milestones": milestones,
        "stats": {"xp": s.xp, "level": level, "xp_into_level": into, "xp_for_next_level": need,
                  "current_streak": s.current_streak, "longest_streak": s.longest_streak,
                  "activities_completed": completed_acts, "assessments_completed": completed_assess,
                  "badges": len(achievements)},
    }
