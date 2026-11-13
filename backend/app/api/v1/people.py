"""Guardians (parent portal), mentors (mentor/teacher portal), notifications and messages."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select

from ...core.deps import DB, CurrentUser, Paging, require_permission
from ...core.errors import Forbidden, NotFound, ValidationFailed
from ...core.permissions import P, Role
from ...core.security import utcnow
from ...models import (
    AssessmentAttempt,
    Batch,
    BatchMember,
    ConsentRecord,
    Guardian,
    Mentor,
    MentorFeedback,
    Message,
    Notification,
    Recommendation,
    Student,
    StudentGuardian,
    Submission,
    User,
)
from ...repositories.base import paginate
from ...schemas.common import Message as Msg
from ...schemas.common import Page
from ...schemas.growth import (
    BroadcastIn,
    MentorFeedbackIn,
    MentorFeedbackOut,
    MessageIn,
    MessageOut,
    NotificationOut,
    NotificationPrefs,
)
from ...services import students as student_svc
from ...services.access import (
    accessible_student_ids,
    ensure_student_access,
    guardian_for_user,
    mentor_for_user,
    mentor_student_ids,
)
from ...services.audit import audit
from ...services.auth import link_guardian
from ...services.notify import notify, notify_guardians
from ...services.progress import progress_summary

router = APIRouter(tags=["people"])

CONSENT_TYPES = ("data_processing", "ai_processing", "portfolio_sharing", "communications", "mentor_access")


# ============================ guardians ============================

class LinkChildIn(BaseModel):
    invite_code: str = Field(min_length=6, max_length=16)
    relationship: Literal["parent", "guardian", "grandparent", "other"] = "parent"


class ConsentIn(BaseModel):
    consent_type: Literal["data_processing", "ai_processing", "portfolio_sharing", "communications", "mentor_access"]
    granted: bool


@router.get("/guardians/me/children")
def my_children(db: DB, user: User = Depends(require_permission(P.CHILDREN_VIEW))):
    g = guardian_for_user(db, user)
    links = db.scalars(select(StudentGuardian).where(StudentGuardian.guardian_id == g.id,
                                                     StudentGuardian.status == "active")).all()
    out = []
    for link in links:
        s = db.get(Student, link.student_id)
        if s and s.deleted_at is None:
            out.append({**student_svc.student_summary(s).model_dump(mode="json"), "relationship": link.relationship_type,
                        "consent_status": s.consent_status})
    return out


@router.post("/guardians/me/children", status_code=201)
def link_child(data: LinkChildIn, request: Request, db: DB, user: User = Depends(require_permission(P.CHILDREN_VIEW))):
    g = guardian_for_user(db, user)
    s = link_guardian(db, g, data.invite_code, data.relationship)
    audit(db, "guardian.linked", actor=user, entity_type="student", entity_id=s.id, category="security", request=request)
    db.commit()
    return student_svc.student_summary(s)


@router.get("/guardians/children/{student_id}/overview")
def child_overview(student_id: uuid.UUID, db: DB, user: User = Depends(require_permission(P.CHILDREN_VIEW))):
    s = ensure_student_access(db, user, student_id)
    from ...services.interests import active_interests
    from ...models import Domain, ProgressEvent
    domains = dict(db.execute(select(Domain.id, Domain.name)).all())
    recent = db.scalars(select(ProgressEvent).where(ProgressEvent.student_id == s.id,
                                                    ProgressEvent.event_type.in_(("activity_submitted", "project_submitted",
                                                                                  "assessment_completed", "activity_completed",
                                                                                  "achievement_unlocked", "milestone_reached")))
                        .order_by(ProgressEvent.occurred_at.desc()).limit(15)).all()
    feedback = db.scalars(select(MentorFeedback).where(MentorFeedback.student_id == s.id,
                                                       MentorFeedback.visible_to_guardian.is_(True))
                          .order_by(MentorFeedback.created_at.desc()).limit(10)).all()
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_({f.mentor_user_id for f in feedback}))).all()) if feedback else {}
    mentors = db.execute(select(User.id, User.full_name).join(Mentor, Mentor.user_id == User.id)
                         .join(Batch, Batch.mentor_id == Mentor.id).join(BatchMember, BatchMember.batch_id == Batch.id)
                         .where(BatchMember.student_id == s.id).distinct()).all()
    recs = db.scalars(select(Recommendation).where(Recommendation.student_id == s.id, Recommendation.status == "active")
                      .order_by(Recommendation.priority).limit(5)).all()
    return {
        "student": student_svc.student_summary(s),
        "interests": [{"domain_id": str(i.domain_id), "domain_name": domains.get(i.domain_id), "strength": i.strength,
                       "is_favourite": i.is_favourite} for i in active_interests(db, s.id) if i.subdomain_id is None],
        "progress": progress_summary(db, s),
        "recent_activity": [{"type": e.event_type, "title": (e.payload or {}).get("title"), "score_pct": e.score_pct,
                             "domain_name": domains.get(e.domain_id), "at": e.occurred_at.isoformat()} for e in recent],
        "mentor_feedback": [{"content": f.content, "mentor_name": names.get(f.mentor_user_id), "at": f.created_at.isoformat(),
                             "domain_name": domains.get(f.domain_id)} for f in feedback],
        "mentors": [{"user_id": str(uid), "name": n} for uid, n in mentors],
        "recommendations": [{"title": r.title, "kind": r.kind, "reasons": r.reasons} for r in recs],
        "consent_status": s.consent_status,
    }


@router.get("/guardians/children/{student_id}/consents")
def consents(student_id: uuid.UUID, db: DB, user: User = Depends(require_permission(P.CONSENT_MANAGE))):
    ensure_student_access(db, user, student_id)
    rows = db.scalars(select(ConsentRecord).where(ConsentRecord.student_id == student_id)
                      .order_by(ConsentRecord.created_at.desc())).all()
    current: dict[str, dict] = {}
    for r in rows:
        current.setdefault(r.consent_type, {"granted": r.granted, "at": r.created_at.isoformat(), "policy_version": r.policy_version})
    return {"current": {t: current.get(t, {"granted": False, "at": None}) for t in CONSENT_TYPES},
            "history": [{"type": r.consent_type, "granted": r.granted, "at": r.created_at.isoformat()} for r in rows]}


@router.post("/guardians/children/{student_id}/consents", status_code=201)
def set_consent(student_id: uuid.UUID, data: ConsentIn, request: Request, db: DB,
                user: User = Depends(require_permission(P.CONSENT_MANAGE))):
    s = ensure_student_access(db, user, student_id)
    g = guardian_for_user(db, user)
    db.add(ConsentRecord(student_id=s.id, guardian_id=g.id, granted_by_user_id=user.id, consent_type=data.consent_type,
                         granted=data.granted, ip_address=request.client.host if request.client else None))
    if data.consent_type == "data_processing":
        s.consent_status = "granted" if data.granted else "revoked"
    if data.consent_type == "portfolio_sharing" and not data.granted:
        from ...models import Portfolio
        p = db.scalar(select(Portfolio).where(Portfolio.student_id == s.id))
        if p:
            p.guardian_approved_sharing = False
            if p.visibility == "link":
                p.visibility, p.share_token = "guardians", None
    audit(db, f"consent.{'granted' if data.granted else 'revoked'}", actor=user, entity_type="student", entity_id=s.id,
          category="security", request=request, details={"type": data.consent_type})
    notify(db, s.user_id, "consent", f"Guardian {'gave' if data.granted else 'withdrew'} consent: {data.consent_type.replace('_', ' ')}")
    db.commit()
    return {"consent_type": data.consent_type, "granted": data.granted, "consent_status": s.consent_status}


# ============================ mentors ============================

class BatchIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    domain_id: uuid.UUID | None = None
    student_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)


class BatchMembersIn(BaseModel):
    student_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)


def _batch_out(db, b: Batch) -> dict:
    ids = db.scalars(select(BatchMember.student_id).where(BatchMember.batch_id == b.id)).all()
    students = [student_svc.student_summary(s) for s in db.scalars(select(Student).where(Student.id.in_(ids))).all()] if ids else []
    return {"id": str(b.id), "name": b.name, "description": b.description, "domain_id": str(b.domain_id) if b.domain_id else None,
            "student_count": len(students), "students": students, "created_at": b.created_at.isoformat()}


@router.get("/mentors/me/students")
def my_students(db: DB, user: User = Depends(require_permission(P.STUDENTS_VIEW_ASSIGNED))):
    ids = accessible_student_ids(db, user)
    stmt = select(Student).where(Student.deleted_at.is_(None))
    if ids is not None:
        stmt = stmt.where(Student.id.in_(ids or [uuid.uuid4()]))
    students = db.scalars(stmt).all()
    pending = dict(db.execute(select(Submission.student_id, func.count()).where(Submission.status == "submitted")
                              .group_by(Submission.student_id)).all())
    return sorted([{**student_svc.student_summary(s).model_dump(mode="json"), "pending_reviews": pending.get(s.id, 0)}
                   for s in students], key=lambda x: x["full_name"])


@router.get("/mentors/me/batches")
def my_batches(db: DB, user: User = Depends(require_permission(P.BATCHES_MANAGE))):
    m = mentor_for_user(db, user)
    return [_batch_out(db, b) for b in db.scalars(select(Batch).where(Batch.mentor_id == m.id, Batch.deleted_at.is_(None))
                                                  .order_by(Batch.name)).all()]


def _check_assignable(db, user: User, student_ids: list[uuid.UUID]) -> None:
    rows = db.scalars(select(Student).where(Student.id.in_(student_ids), Student.deleted_at.is_(None))).all()
    if len(rows) != len(set(student_ids)):
        raise NotFound("One or more students not found")
    if user.role not in (Role.PLATFORM_ADMIN, Role.SUPER_ADMIN):
        if any(s.institution_id != user.institution_id for s in rows):
            raise Forbidden("Students must belong to your institution")


@router.post("/mentors/me/batches", status_code=201)
def create_batch(data: BatchIn, db: DB, user: User = Depends(require_permission(P.BATCHES_MANAGE))):
    m = mentor_for_user(db, user)
    if data.student_ids:
        _check_assignable(db, user, data.student_ids)
    b = Batch(mentor_id=m.id, name=data.name, description=data.description, domain_id=data.domain_id,
              institution_id=user.institution_id)
    db.add(b)
    db.flush()
    for sid in dict.fromkeys(data.student_ids):
        db.add(BatchMember(batch_id=b.id, student_id=sid))
    db.commit()
    return _batch_out(db, b)


@router.post("/mentors/me/batches/{batch_id}/members")
def add_members(batch_id: uuid.UUID, data: BatchMembersIn, db: DB, user: User = Depends(require_permission(P.BATCHES_MANAGE))):
    m = mentor_for_user(db, user)
    b = db.get(Batch, batch_id)
    if b is None or b.mentor_id != m.id or b.deleted_at is not None:
        raise NotFound("Batch not found")
    _check_assignable(db, user, data.student_ids)
    existing = set(db.scalars(select(BatchMember.student_id).where(BatchMember.batch_id == b.id)).all())
    for sid in dict.fromkeys(data.student_ids):
        if sid not in existing:
            db.add(BatchMember(batch_id=b.id, student_id=sid))
    db.commit()
    return _batch_out(db, b)


@router.delete("/mentors/me/batches/{batch_id}/members/{student_id}")
def remove_member(batch_id: uuid.UUID, student_id: uuid.UUID, db: DB,
                  user: User = Depends(require_permission(P.BATCHES_MANAGE))):
    m = mentor_for_user(db, user)
    b = db.get(Batch, batch_id)
    if b is None or b.mentor_id != m.id:
        raise NotFound("Batch not found")
    row = db.scalar(select(BatchMember).where(BatchMember.batch_id == b.id, BatchMember.student_id == student_id))
    if row:
        db.delete(row)
    db.commit()
    return _batch_out(db, b)


@router.get("/mentors/me/review-queue")
def review_queue(db: DB, user: User = Depends(require_permission(P.SUBMISSIONS_EVALUATE))):
    from ...services.activities import submission_out
    allowed = accessible_student_ids(db, user)
    restrict = (lambda col: col.in_(allowed or [uuid.uuid4()])) if allowed is not None else (lambda col: True)
    subs = db.scalars(select(Submission).where(Submission.status == "submitted", restrict(Submission.student_id))
                      .order_by(Submission.submitted_at).limit(50)).all()
    attempts = db.scalars(select(AssessmentAttempt).where(AssessmentAttempt.status == "pending_review",
                                                          restrict(AssessmentAttempt.student_id)).limit(50)).all()
    recs = db.scalars(select(Recommendation).where(Recommendation.status.in_(("active", "disagreed")),
                                                   Recommendation.mentor_review_status == "pending",
                                                   Recommendation.kind.in_(("promising_domain", "focus_domain")),
                                                   restrict(Recommendation.student_id)).limit(50)).all()
    names = {s.id: s.user.full_name for s in db.scalars(select(Student).where(
        Student.id.in_({a.student_id for a in attempts} | {r.student_id for r in recs}))).all()} if (attempts or recs) else {}
    return {
        "submissions": [submission_out(db, s, include_evals=False) for s in subs],
        "attempts": [{"id": str(a.id), "student_id": str(a.student_id), "student_name": names.get(a.student_id),
                      "assessment_title": a.assessment.title, "submitted_at": a.submitted_at.isoformat() if a.submitted_at else None}
                     for a in attempts],
        "recommendations": [{"id": str(r.id), "student_id": str(r.student_id), "student_name": names.get(r.student_id),
                             "title": r.title, "kind": r.kind, "status": r.status, "reasons": r.reasons,
                             "student_response": r.student_response} for r in recs],
    }


@router.post("/mentors/students/{student_id}/feedback", response_model=MentorFeedbackOut, status_code=201)
def add_feedback(student_id: uuid.UUID, data: MentorFeedbackIn, db: DB,
                 user: User = Depends(require_permission(P.FEEDBACK_WRITE))):
    s = ensure_student_access(db, user, student_id, write=True)
    fb = MentorFeedback(mentor_user_id=user.id, student_id=s.id, **data.model_dump())
    db.add(fb)
    from ...models import ProgressEvent
    db.add(ProgressEvent(student_id=s.id, domain_id=data.domain_id, event_type="mentor_feedback",
                         source_type="mentor_feedback", payload={"kind": data.kind, "excerpt": data.content[:200]}))
    if data.visible_to_student:
        notify(db, s.user_id, "mentor_feedback", f"New {data.kind} from {user.full_name}", data.content[:200], "/app/progress")
    if data.visible_to_guardian:
        notify_guardians(db, s.id, "mentor_feedback", f"Mentor note about {s.user.first_name}", data.content[:200])
    db.commit()
    out = MentorFeedbackOut.model_validate(fb)
    out.mentor_name = user.full_name
    return out


@router.get("/mentors/students/{student_id}/feedback", response_model=list[MentorFeedbackOut])
def list_feedback(student_id: uuid.UUID, user: CurrentUser, db: DB):
    s = ensure_student_access(db, user, student_id)
    stmt = select(MentorFeedback).where(MentorFeedback.student_id == s.id)
    if user.role == Role.STUDENT:
        stmt = stmt.where(MentorFeedback.visible_to_student.is_(True))
    if user.role == Role.GUARDIAN:
        stmt = stmt.where(MentorFeedback.visible_to_guardian.is_(True))
    rows = db.scalars(stmt.order_by(MentorFeedback.created_at.desc()).limit(100)).all()
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_({r.mentor_user_id for r in rows}))).all()) if rows else {}
    out = []
    for r in rows:
        o = MentorFeedbackOut.model_validate(r)
        o.mentor_name = names.get(r.mentor_user_id)
        out.append(o)
    return out


# ============================ notifications ============================

@router.get("/notifications", response_model=Page[NotificationOut])
def notifications(user: CurrentUser, db: DB, paging: Paging, unread_only: bool = False):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    return paginate(db, stmt.order_by(Notification.created_at.desc()), paging, Notification, set())


@router.get("/notifications/unread-count")
def unread_count(user: CurrentUser, db: DB):
    return {"count": db.scalar(select(func.count()).select_from(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None))) or 0}


@router.post("/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: uuid.UUID, user: CurrentUser, db: DB):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise NotFound("Notification not found")
    n.read_at = n.read_at or utcnow()
    db.commit()
    return n


@router.post("/notifications/read-all", response_model=Msg)
def mark_all(user: CurrentUser, db: DB):
    for n in db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))):
        n.read_at = utcnow()
    db.commit()
    return Msg(message="All notifications marked as read")


@router.get("/notifications/preferences", response_model=NotificationPrefs)
def get_prefs(user: CurrentUser):
    return NotificationPrefs(**(user.preferences or {}).get("notifications", {}))


@router.put("/notifications/preferences", response_model=NotificationPrefs)
def set_prefs(data: NotificationPrefs, user: CurrentUser, db: DB):
    user.preferences = {**(user.preferences or {}), "notifications": data.model_dump()}
    db.commit()
    return data


@router.post("/notifications/broadcast", response_model=Msg)
def broadcast(data: BroadcastIn, request: Request, db: DB,
              user: User = Depends(require_permission(P.NOTIFICATIONS_BROADCAST))):
    stmt = select(User.id).where(User.deleted_at.is_(None), User.is_active.is_(True))
    if data.roles:
        stmt = stmt.where(User.role.in_(data.roles))
    if data.institution_id:
        stmt = stmt.where(User.institution_id == data.institution_id)
    ids = db.scalars(stmt).all()
    for uid in ids:
        db.add(Notification(user_id=uid, kind="announcement", title=data.title, body=data.body, link=data.link))
    audit(db, "notification.broadcast", actor=user, category="admin", request=request, details={"recipients": len(ids)})
    db.commit()
    return Msg(message=f"Sent to {len(ids)} user(s)")


# ============================ messages (parent <-> mentor) ============================

def _can_message(db, sender: User, recipient: User, student: Student) -> None:
    """Allowed pairs: a guardian of the student <-> a mentor/teacher of the student."""
    def related(u: User) -> bool:
        if u.role == Role.GUARDIAN:
            g = db.scalar(select(Guardian).where(Guardian.user_id == u.id))
            return bool(g and db.scalar(select(StudentGuardian.id).where(
                StudentGuardian.guardian_id == g.id, StudentGuardian.student_id == student.id,
                StudentGuardian.status == "active")))
        if u.role in (Role.MENTOR, Role.TEACHER):
            m = db.scalar(select(Mentor).where(Mentor.user_id == u.id))
            return bool(m and student.id in mentor_student_ids(db, m)) or (
                u.role == Role.TEACHER and u.institution_id is not None and u.institution_id == student.institution_id)
        return False
    roles = {sender.role, recipient.role}
    if not (Role.GUARDIAN in roles and roles & {Role.MENTOR, Role.TEACHER}):
        raise Forbidden("Messages are available between guardians and the student's mentors")
    if not (related(sender) and related(recipient)):
        raise Forbidden("Both people must be connected to this student")


@router.get("/messages", response_model=list[MessageOut])
def list_messages(student_id: uuid.UUID, db: DB, user: User = Depends(require_permission(P.MESSAGES_SEND))):
    ensure_student_access(db, user, student_id)
    rows = db.scalars(select(Message).where(Message.student_id == student_id,
                                            or_(Message.sender_id == user.id, Message.recipient_id == user.id))
                      .order_by(Message.created_at).limit(500)).all()
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_({r.sender_id for r in rows}))).all()) if rows else {}
    for r in rows:
        if r.recipient_id == user.id and r.read_at is None:
            r.read_at = utcnow()
    db.commit()
    out = []
    for r in rows:
        o = MessageOut.model_validate(r)
        o.sender_name = names.get(r.sender_id)
        out.append(o)
    return out


@router.post("/messages", response_model=MessageOut, status_code=201)
def send_message(data: MessageIn, db: DB, user: User = Depends(require_permission(P.MESSAGES_SEND))):
    s = ensure_student_access(db, user, data.student_id)
    recipient = db.get(User, data.recipient_id)
    if recipient is None or recipient.deleted_at is not None:
        raise NotFound("Recipient not found")
    _can_message(db, user, recipient, s)
    m = Message(student_id=s.id, sender_id=user.id, recipient_id=recipient.id, body=data.body.strip())
    if not m.body:
        raise ValidationFailed("Message is empty")
    db.add(m)
    notify(db, recipient.id, "message", f"New message from {user.full_name}", data.body[:120],
           f"/messages?student={s.id}")
    db.commit()
    out = MessageOut.model_validate(m)
    out.sender_name = user.full_name
    return out


@router.get("/messages/contacts")
def contacts(student_id: uuid.UUID, db: DB, user: User = Depends(require_permission(P.MESSAGES_SEND))):
    s = ensure_student_access(db, user, student_id)
    if user.role == Role.GUARDIAN:
        rows = db.execute(select(User.id, User.full_name, User.role).join(Mentor, Mentor.user_id == User.id)
                          .join(Batch, Batch.mentor_id == Mentor.id).join(BatchMember, BatchMember.batch_id == Batch.id)
                          .where(BatchMember.student_id == s.id).distinct()).all()
    else:
        rows = db.execute(select(User.id, User.full_name, User.role).join(Guardian, Guardian.user_id == User.id)
                          .join(StudentGuardian, and_(StudentGuardian.guardian_id == Guardian.id,
                                                      StudentGuardian.student_id == s.id, StudentGuardian.status == "active"))).all()
    return [{"user_id": str(i), "name": n, "role": r} for i, n, r in rows]
