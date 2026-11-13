"""Role-experience read models: live sessions & attendance, student courses,
mentor attention list. All computed from real records; nothing is mocked."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    Activity,
    ActivityAssignment,
    Assessment,
    BatchMember,
    Domain,
    LiveSession,
    ProgressEvent,
    Recommendation,
    SessionParticipant,
    Student,
    StudentInterest,
    Submission,
    User,
)
from .auth import age_on

ATTENDED = ("present", "late")


def now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- sessions

def session_out(db: Session, s: LiveSession, student_id: uuid.UUID | None = None) -> dict:
    parts = db.scalars(select(SessionParticipant).where(SessionParticipant.session_id == s.id)).all()
    mentor = db.get(User, s.mentor_user_id)
    domain = db.get(Domain, s.domain_id) if s.domain_id else None
    end = s.starts_at + timedelta(minutes=s.duration_minutes)
    t = now()
    phase = "cancelled" if s.status == "cancelled" else ("live" if s.starts_at <= t <= end else ("upcoming" if s.starts_at > t else "past"))
    out = {
        "id": str(s.id), "title": s.title, "description": s.description, "starts_at": s.starts_at.isoformat(),
        "ends_at": end.isoformat(), "duration_minutes": s.duration_minutes, "meeting_url": s.meeting_url,
        "location": s.location, "status": s.status, "phase": phase, "batch_id": str(s.batch_id) if s.batch_id else None,
        "domain_id": str(s.domain_id) if s.domain_id else None, "domain_name": domain.name if domain else None,
        "mentor_user_id": str(s.mentor_user_id), "mentor_name": mentor.full_name if mentor else None,
        "participants": len(parts),
        "attendance_marked": sum(p.attendance != "pending" for p in parts),
        "attended": sum(p.attendance in ATTENDED for p in parts),
        # meeting links are only revealed shortly before the session
        "can_join": phase == "live" or (phase == "upcoming" and s.starts_at - t <= timedelta(minutes=15)),
    }
    if student_id:
        mine = next((p for p in parts if p.student_id == student_id), None)
        out["my_attendance"] = mine.attendance if mine else None
    return out


def attendance_summary(db: Session, student_id: uuid.UUID) -> dict:
    rows = db.execute(
        select(SessionParticipant.attendance).join(LiveSession, LiveSession.id == SessionParticipant.session_id)
        .where(SessionParticipant.student_id == student_id, LiveSession.status != "cancelled", LiveSession.starts_at <= now())
    ).scalars().all()
    marked = [r for r in rows if r != "pending"]
    attended = sum(r in ATTENDED for r in marked)
    rate = round(attended / len(marked) * 100) if marked else None
    label = "No sessions yet" if rate is None else ("Excellent" if rate >= 90 else "Good" if rate >= 75 else "Needs attention")
    return {"sessions": len(marked), "attended": attended, "missed": sum(r == "absent" for r in marked),
            "excused": sum(r == "excused" for r in marked), "rate": rate, "label": label}


def upcoming_sessions_for_student(db: Session, student_id: uuid.UUID, limit: int = 5) -> list[LiveSession]:
    return list(db.scalars(
        select(LiveSession).join(SessionParticipant, SessionParticipant.session_id == LiveSession.id)
        .where(SessionParticipant.student_id == student_id, LiveSession.status == "scheduled",
               LiveSession.starts_at >= now() - timedelta(hours=2))
        .order_by(LiveSession.starts_at).limit(limit)).all())


def sessions_students(db: Session, batch_id: uuid.UUID | None, student_ids: list[uuid.UUID]) -> list[uuid.UUID]:
    ids = list(student_ids)
    if batch_id:
        ids += db.scalars(select(BatchMember.student_id).where(BatchMember.batch_id == batch_id)).all()
    return list(dict.fromkeys(ids))


# ---------------------------------------------------------------- courses

def student_courses(db: Session, s: Student) -> list[dict]:
    """A 'course' is a domain the student chose; its lessons are that domain's
    age-appropriate activities. Progress = activities completed / available."""
    age = age_on(s.date_of_birth)
    chosen = [i.domain_id for i in db.scalars(select(StudentInterest).where(
        StudentInterest.student_id == s.id, StudentInterest.is_active.is_(True), StudentInterest.subdomain_id.is_(None))).all()]
    if not chosen:
        return []
    domains = {d.id: d for d in db.scalars(select(Domain).where(Domain.id.in_(chosen))).all()}
    acts = db.scalars(select(Activity).where(
        Activity.domain_id.in_(chosen), Activity.status == "published", Activity.deleted_at.is_(None),
        Activity.min_age <= age, Activity.max_age >= age,
        (Activity.institution_id.is_(None)) | (Activity.institution_id == s.institution_id),
    ).order_by(Activity.difficulty, Activity.title)).all()
    status = dict(db.execute(select(ActivityAssignment.activity_id, ActivityAssignment.status)
                             .where(ActivityAssignment.student_id == s.id)).all())
    last_sub = dict(db.execute(select(Submission.activity_id, func.max(Submission.submitted_at))
                               .where(Submission.student_id == s.id).group_by(Submission.activity_id)).all())
    assess = dict(db.execute(select(Assessment.domain_id, func.count()).where(
        Assessment.domain_id.in_(chosen), Assessment.status == "published", Assessment.deleted_at.is_(None),
        Assessment.min_age <= age, Assessment.max_age >= age).group_by(Assessment.domain_id)).all())
    by_domain: dict[uuid.UUID, list[Activity]] = defaultdict(list)
    for a in acts:
        by_domain[a.domain_id].append(a)
    out = []
    for dom_id in chosen:
        d = domains.get(dom_id)
        if not d:
            continue
        items = by_domain.get(dom_id, [])
        done = [a for a in items if status.get(a.id) == "completed"]
        doing = [a for a in items if status.get(a.id) in ("assigned", "in_progress", "submitted")]
        todo = [a for a in items if status.get(a.id) is None]
        recent = sorted((a for a in items if a.id in last_sub), key=lambda a: last_sub[a.id], reverse=True)[:3]
        nxt = (doing or todo or [None])[0]
        out.append({
            "domain_id": str(d.id), "slug": d.slug, "name": d.name, "tagline": d.tagline, "color": d.color, "icon": d.icon,
            "lessons_total": len(items), "lessons_completed": len(done), "lessons_in_progress": len(doing),
            "assessments": int(assess.get(dom_id, 0)),
            "percent": round(len(done) / len(items) * 100) if items else 0,
            "next_lesson": None if nxt is None else {"id": str(nxt.id), "title": nxt.title, "minutes": nxt.estimated_minutes,
                                                     "status": status.get(nxt.id) or "not_started"},
            "recent": [{"id": str(a.id), "title": a.title, "at": last_sub[a.id].isoformat()} for a in recent],
        })
    return out


# ---------------------------------------------------------------- mentor attention

def attention_list(db: Session, student_ids: set[uuid.UUID]) -> list[dict]:
    """Students who may need support, each with plain-language reasons."""
    if not student_ids:
        return []
    t = now()
    last_event = dict(db.execute(select(ProgressEvent.student_id, func.max(ProgressEvent.occurred_at))
                                 .where(ProgressEvent.student_id.in_(student_ids)).group_by(ProgressEvent.student_id)).all())
    waiting = dict(db.execute(select(Submission.student_id, func.count()).where(
        Submission.student_id.in_(student_ids), Submission.status == "submitted",
        Submission.submitted_at <= t - timedelta(days=3)).group_by(Submission.student_id)).all())
    overdue = dict(db.execute(select(ActivityAssignment.student_id, func.count()).where(
        ActivityAssignment.student_id.in_(student_ids), ActivityAssignment.due_at.is_not(None), ActivityAssignment.due_at < t,
        ActivityAssignment.status.in_(("assigned", "in_progress"))).group_by(ActivityAssignment.student_id)).all())
    disagreed = dict(db.execute(select(Recommendation.student_id, func.count()).where(
        Recommendation.student_id.in_(student_ids), Recommendation.status == "disagreed",
        Recommendation.mentor_review_status == "pending").group_by(Recommendation.student_id)).all())
    students = {s.id: s for s in db.scalars(select(Student).where(Student.id.in_(student_ids), Student.deleted_at.is_(None))).all()}
    out = []
    for sid, s in students.items():
        reasons: list[dict] = []
        last = last_event.get(sid)
        if last is None or last < t - timedelta(days=14):
            days = None if last is None else (t - last).days
            reasons.append({"code": "inactive", "text": "No learning activity yet" if days is None else f"No activity for {days} days"})
        if waiting.get(sid):
            reasons.append({"code": "review_waiting", "text": f"{waiting[sid]} submission(s) waiting more than 3 days for review"})
        if overdue.get(sid):
            reasons.append({"code": "overdue", "text": f"{overdue[sid]} overdue task(s)"})
        att = attendance_summary(db, sid)
        if att["rate"] is not None and att["sessions"] >= 3 and att["rate"] < 75:
            reasons.append({"code": "attendance", "text": f"Attendance {att['rate']}% across {att['sessions']} sessions"})
        if disagreed.get(sid):
            reasons.append({"code": "disagreed", "text": "Disagreed with a suggestion - worth a conversation"})
        if reasons:
            out.append({"student_id": str(sid), "full_name": s.user.full_name, "age_group": s.age_group.label if s.age_group else None,
                        "reasons": reasons, "last_active": last.isoformat() if last else None})
    out.sort(key=lambda r: (-len(r["reasons"]), r["full_name"]))
    return out


# ---------------------------------------------------------------- student tasks & week

DIMENSION_TIPS = {
    "performance": "Accuracy on quizzes and tasks",
    "learning_progress": "Improving from one try to the next",
    "problem_solving": "Working through tricky problems",
    "creativity": "Original ideas in your projects",
    "consistency": "Practising a little every week",
    "engagement": "Finishing what you start",
    "adaptability": "Trying new kinds of challenges",
}


def student_tasks(db: Session, s: Student) -> dict:
    from ..models import AssessmentAttempt
    t = now()
    rows = db.execute(select(ActivityAssignment, Activity).join(Activity, Activity.id == ActivityAssignment.activity_id)
                      .where(ActivityAssignment.student_id == s.id)
                      .order_by(ActivityAssignment.due_at.is_(None), ActivityAssignment.due_at)).all()
    dnames = dict(db.execute(select(Domain.id, Domain.name)).all())
    pending, waiting = [], []
    for asg, a in rows:
        item = {"type": "activity", "id": str(a.id), "assignment_id": str(asg.id), "title": a.title,
                "domain_name": dnames.get(a.domain_id), "minutes": a.estimated_minutes, "status": asg.status,
                "due_at": asg.due_at.isoformat() if asg.due_at else None,
                "overdue": bool(asg.due_at and asg.due_at < t and asg.status in ("assigned", "in_progress")),
                "due_soon": bool(asg.due_at and t <= asg.due_at <= t + timedelta(days=3))}
        if asg.status in ("assigned", "in_progress"):
            pending.append(item)
        elif asg.status == "submitted":
            waiting.append(item)
    for at in db.scalars(select(AssessmentAttempt).where(AssessmentAttempt.student_id == s.id,
                                                         AssessmentAttempt.status == "in_progress")).all():
        pending.append({"type": "assessment", "id": str(at.assessment_id), "attempt_id": str(at.id), "title": at.assessment.title,
                        "domain_name": dnames.get(at.assessment.domain_id), "minutes": None, "status": "in_progress",
                        "due_at": at.expires_at.isoformat() if at.expires_at else None, "overdue": False,
                        "due_soon": bool(at.expires_at)})
    quizzes = db.scalars(select(AssessmentAttempt).where(AssessmentAttempt.student_id == s.id,
                                                         AssessmentAttempt.status.in_(("evaluated", "pending_review")))
                         .order_by(AssessmentAttempt.submitted_at.desc()).limit(8)).all()
    completed_events = db.scalars(select(ProgressEvent).where(
        ProgressEvent.student_id == s.id, ProgressEvent.event_type.in_(("activity_completed", "project_submitted")),
        ProgressEvent.is_superseded.is_(False)).order_by(ProgressEvent.occurred_at.desc()).limit(8)).all()
    week_start = (t - timedelta(days=t.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return {
        "counts": {"pending": len(pending), "overdue": sum(p["overdue"] for p in pending),
                   "due_soon": sum(p["due_soon"] for p in pending), "waiting_review": len(waiting),
                   "completed_this_week": sum(1 for e in completed_events if e.occurred_at >= week_start)},
        "pending": pending,
        "waiting_review": waiting,
        "completed": [{"title": (e.payload or {}).get("title"), "score_pct": e.score_pct, "domain_name": dnames.get(e.domain_id),
                       "at": e.occurred_at.isoformat()} for e in completed_events],
        "quiz_results": [{"attempt_id": str(q.id), "title": q.assessment.title, "status": q.status,
                          "score_pct": round(q.normalized_score) if q.normalized_score is not None else None,
                          "domain_name": dnames.get(q.assessment.domain_id),
                          "at": (q.submitted_at or q.started_at).isoformat()} for q in quizzes],
    }


def student_week(db: Session, s: Student) -> dict:
    """Daily learning actions for the last 14 days plus plain-language strengths and areas to improve."""
    from .scoring import latest_scores
    t = now()
    start = (t - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)
    evs = db.scalars(select(ProgressEvent.occurred_at).where(
        ProgressEvent.student_id == s.id, ProgressEvent.occurred_at >= start,
        ProgressEvent.event_type.notin_(("achievement_unlocked", "mentor_feedback")))).all()
    counts: dict[str, int] = defaultdict(int)
    for at in evs:
        counts[at.date().isoformat()] += 1
    days = []
    for i in range(14):
        d = (start + timedelta(days=i)).date().isoformat()
        days.append({"date": d, "actions": counts.get(d, 0)})
    this_week, last_week = days[7:], days[:7]
    dnames = {d.id: d.name for d in db.scalars(select(Domain)).all()}
    dims: dict[str, list[float]] = defaultdict(list)
    skills = []
    for sc in latest_scores(db, s.id):
        if sc.skill_score is not None:
            skills.append({"domain_name": dnames.get(sc.domain_id), "skill_score": round(sc.skill_score),
                           "confidence_label": sc.confidence_label, "evidence_count": sc.evidence_count})
        for d in sc.dimensions or []:
            if d.get("value") is not None:
                dims[d["key"]].append(d["value"])
    avg = sorted(((k, sum(v) / len(v)) for k, v in dims.items()), key=lambda kv: kv[1])

    def fmt(k: str, v: float) -> dict:
        return {"key": k, "label": k.replace("_", " ").capitalize(), "tip": DIMENSION_TIPS.get(k, ""), "value": round(v)}

    enough = len(avg) >= 3
    return {
        "days": days,
        "active_days_this_week": sum(1 for d in this_week if d["actions"]),
        "actions_this_week": sum(d["actions"] for d in this_week),
        "actions_last_week": sum(d["actions"] for d in last_week),
        "skills": sorted(skills, key=lambda x: -x["skill_score"]),
        "strengths": [fmt(k, v) for k, v in reversed(avg[-2:])] if enough else [],
        "areas_to_improve": [fmt(k, v) for k, v in avg[:2]] if enough else [],
    }
