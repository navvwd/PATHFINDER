"""Live sessions & attendance, student courses, mentor attention, role/permission matrix."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field, HttpUrl, model_validator
from sqlalchemy import select

from ...core.deps import DB, CurrentUser, is_global, require_permission
from ...core.errors import Forbidden, NotFound, ValidationFailed
from ...core.permissions import P, ROLE_PERMISSIONS, Role
from ...core.security import utcnow
from ...models import Batch, Domain, LiveSession, Mentor, SessionParticipant, Student
from ...services import experience as svc
from ...services.access import accessible_student_ids, ensure_student_access, resolve_student
from ...services.audit import audit
from ...services.notify import notify, notify_guardians

router = APIRouter(tags=["experience"])


class SessionIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    starts_at: datetime
    duration_minutes: int = Field(default=45, ge=10, le=480)
    meeting_url: HttpUrl | None = None
    location: str | None = Field(default=None, max_length=200)
    domain_id: uuid.UUID | None = None
    batch_id: uuid.UUID | None = None
    student_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def _who(self):
        if not self.batch_id and not self.student_ids:
            raise ValueError("Choose a batch or at least one student")
        if not self.meeting_url and not self.location:
            raise ValueError("Add a meeting link or a location")
        return self


class SessionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    starts_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=10, le=480)
    meeting_url: HttpUrl | None = None
    location: str | None = Field(default=None, max_length=200)
    status: Literal["scheduled", "cancelled", "completed"] | None = None


class AttendanceRecord(BaseModel):
    student_id: uuid.UUID
    attendance: Literal["pending", "present", "late", "absent", "excused"]


class AttendanceIn(BaseModel):
    records: list[AttendanceRecord] = Field(min_length=1, max_length=500)


def _own_session(db, user, session_id: uuid.UUID) -> LiveSession:
    s = db.get(LiveSession, session_id)
    if s is None:
        raise NotFound("Session not found")
    if not is_global(user) and s.mentor_user_id != user.id and not (
            user.role == Role.INSTITUTION_ADMIN and s.institution_id == user.institution_id):
        raise Forbidden("Only the session's mentor can change it")
    return s


# ---------------------------------------------------------------- sessions

@router.get("/sessions")
def list_sessions(user: CurrentUser, db: DB, when: Literal["upcoming", "past", "all"] = "upcoming",
                  student_id: uuid.UUID | None = None, limit: int = Query(30, ge=1, le=200)):
    t = utcnow()
    stmt = select(LiveSession)
    sid = None
    if user.role in (Role.STUDENT, Role.GUARDIAN) or student_id:
        student = resolve_student(db, user, student_id)
        sid = student.id
        stmt = stmt.join(SessionParticipant, SessionParticipant.session_id == LiveSession.id).where(SessionParticipant.student_id == sid)
    elif user.role in (Role.MENTOR, Role.TEACHER):
        stmt = stmt.where(LiveSession.mentor_user_id == user.id)
    elif not is_global(user):
        stmt = stmt.where(LiveSession.institution_id == user.institution_id)
    if when == "upcoming":
        stmt = stmt.where(LiveSession.starts_at >= t - timedelta(hours=2)).order_by(LiveSession.starts_at)
    elif when == "past":
        stmt = stmt.where(LiveSession.starts_at < t).order_by(LiveSession.starts_at.desc())
    else:
        stmt = stmt.order_by(LiveSession.starts_at.desc())
    rows = db.scalars(stmt.limit(limit)).all()
    out = [svc.session_out(db, s, sid) for s in rows]
    if user.role in (Role.STUDENT, Role.GUARDIAN):
        for o in out:  # links only for the student, and only near start time
            if not o["can_join"] or user.role == Role.GUARDIAN:
                o["meeting_url"] = None
    return out


@router.post("/sessions", status_code=201)
def create_session(data: SessionIn, request: Request, db: DB, user=Depends(require_permission(P.SESSIONS_MANAGE))):
    if data.starts_at.tzinfo is None:
        raise ValidationFailed("starts_at must include a timezone")
    if data.batch_id:
        b = db.get(Batch, data.batch_id)
        if b is None or b.deleted_at is not None:
            raise NotFound("Batch not found")
        mentor = db.scalar(select(Mentor).where(Mentor.user_id == user.id))
        if not is_global(user) and user.role != Role.INSTITUTION_ADMIN and (mentor is None or b.mentor_id != mentor.id):
            raise Forbidden("You can only schedule sessions for your own batches")
    ids = svc.sessions_students(db, data.batch_id, data.student_ids)
    allowed = accessible_student_ids(db, user)
    if allowed is not None and not set(ids) <= allowed:
        raise Forbidden("Some students are not assigned to you")
    if not ids:
        raise ValidationFailed("This batch has no students yet")
    s = LiveSession(mentor_user_id=user.id, institution_id=user.institution_id, batch_id=data.batch_id, domain_id=data.domain_id,
                    title=data.title, description=data.description, starts_at=data.starts_at, duration_minutes=data.duration_minutes,
                    meeting_url=str(data.meeting_url) if data.meeting_url else None, location=data.location)
    db.add(s)
    db.flush()
    when = data.starts_at.strftime("%d %b, %H:%M UTC")
    for sid in ids:
        db.add(SessionParticipant(session_id=s.id, student_id=sid))
        st = db.get(Student, sid)
        if st:
            notify(db, st.user_id, "session", f"New live session: {data.title}", f"{when} with {user.full_name}", "/app/sessions")
            notify_guardians(db, sid, "session", f"{st.user.first_name} has a live session", f"{data.title} - {when}")
    audit(db, "session.created", actor=user, entity_type="live_session", entity_id=s.id, request=request,
          details={"students": len(ids)})
    db.commit()
    return svc.session_out(db, s)


@router.patch("/sessions/{session_id}")
def update_session(session_id: uuid.UUID, data: SessionUpdate, db: DB, user=Depends(require_permission(P.SESSIONS_MANAGE))):
    s = _own_session(db, user, session_id)
    changes = data.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(s, k, str(v) if k == "meeting_url" and v else v)
    if changes.get("status") == "cancelled":
        for p in db.scalars(select(SessionParticipant).where(SessionParticipant.session_id == s.id)).all():
            st = db.get(Student, p.student_id)
            notify(db, st.user_id, "session", f"Session cancelled: {s.title}", None, "/app/sessions")
    db.commit()
    return svc.session_out(db, s)


@router.get("/sessions/{session_id}/attendance")
def get_attendance(session_id: uuid.UUID, db: DB, user=Depends(require_permission(P.SESSIONS_MANAGE))):
    s = _own_session(db, user, session_id)
    parts = db.scalars(select(SessionParticipant).where(SessionParticipant.session_id == s.id)).all()
    names = {st.id: st.user.full_name for st in db.scalars(select(Student).where(Student.id.in_([p.student_id for p in parts]))).all()}
    return {"session": svc.session_out(db, s),
            "records": sorted([{"student_id": str(p.student_id), "full_name": names.get(p.student_id), "attendance": p.attendance,
                                "marked_at": p.marked_at.isoformat() if p.marked_at else None} for p in parts], key=lambda r: r["full_name"] or "")}


@router.put("/sessions/{session_id}/attendance")
def mark_attendance(session_id: uuid.UUID, data: AttendanceIn, request: Request, db: DB, user=Depends(require_permission(P.SESSIONS_MANAGE))):
    s = _own_session(db, user, session_id)
    if s.starts_at > utcnow():
        raise ValidationFailed("Attendance can be marked once the session has started")
    parts = {p.student_id: p for p in db.scalars(select(SessionParticipant).where(SessionParticipant.session_id == s.id)).all()}
    for r in data.records:
        p = parts.get(r.student_id)
        if p is None:
            raise ValidationFailed("Student is not part of this session")
        p.attendance, p.marked_by, p.marked_at = r.attendance, user.id, utcnow()
    if all(p.attendance != "pending" for p in parts.values()) and s.status == "scheduled":
        s.status = "completed"
    audit(db, "session.attendance_marked", actor=user, entity_type="live_session", entity_id=s.id, request=request)
    db.commit()
    return get_attendance(session_id, db, user)


@router.get("/sessions/attendance-summary")
def attendance(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    return svc.attendance_summary(db, s.id)


# ---------------------------------------------------------------- student courses

@router.get("/students/courses")
def courses(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    s = resolve_student(db, user, student_id)
    return svc.student_courses(db, s)


@router.get("/students/tasks")
def tasks(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    return svc.student_tasks(db, resolve_student(db, user, student_id))


@router.get("/students/week")
def week(user: CurrentUser, db: DB, student_id: uuid.UUID | None = None):
    return svc.student_week(db, resolve_student(db, user, student_id))


# ---------------------------------------------------------------- mentor attention

@router.get("/mentors/me/attention")
def attention(db: DB, user=Depends(require_permission(P.STUDENTS_VIEW_ASSIGNED))):
    ids = accessible_student_ids(db, user)
    if ids is None:  # global admins: everyone is too many; use the admin analytics instead
        ids = set(db.scalars(select(Student.id).where(Student.deleted_at.is_(None)).limit(500)).all())
    return svc.attention_list(db, ids)


# ---------------------------------------------------------------- roles & permissions

@router.get("/admin/roles")
def role_matrix(user=Depends(require_permission(P.USERS_MANAGE))):
    """Read-only role -> permission matrix. Permissions are defined in code and
    enforced by the API; role changes per user are made in User Management."""
    perms = sorted(p.value for p in P)
    return {"roles": [{"role": r.value, "permissions": sorted(p.value for p in ROLE_PERMISSIONS[r])} for r in Role],
            "permissions": perms}


_ = (ensure_student_access, Domain)  # re-exported helpers used by other routers
