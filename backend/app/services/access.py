"""Record-level authorization: who may see or act on which student.

This is the single place that answers "can this user access this student?".
Every endpoint that touches student data goes through it.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.deps import is_global
from ..core.errors import Forbidden, NotFound
from ..core.permissions import Role
from ..models import Batch, BatchMember, Guardian, Mentor, Student, StudentGuardian, User


def student_for_user(db: Session, user: User) -> Student:
    s = db.scalar(select(Student).where(Student.user_id == user.id, Student.deleted_at.is_(None)))
    if s is None:
        raise NotFound("Student profile not found")
    return s


def guardian_for_user(db: Session, user: User) -> Guardian:
    g = db.scalar(select(Guardian).where(Guardian.user_id == user.id, Guardian.deleted_at.is_(None)))
    if g is None:
        raise NotFound("Guardian profile not found")
    return g


def mentor_for_user(db: Session, user: User) -> Mentor:
    m = db.scalar(select(Mentor).where(Mentor.user_id == user.id, Mentor.deleted_at.is_(None)))
    if m is None:
        raise NotFound("Mentor profile not found")
    return m


def mentor_student_ids(db: Session, mentor: Mentor) -> set[uuid.UUID]:
    rows = db.scalars(
        select(BatchMember.student_id).join(Batch, Batch.id == BatchMember.batch_id)
        .where(Batch.mentor_id == mentor.id, Batch.deleted_at.is_(None))
    ).all()
    return set(rows)


def guardian_student_ids(db: Session, guardian: Guardian) -> set[uuid.UUID]:
    return set(db.scalars(
        select(StudentGuardian.student_id).where(
            StudentGuardian.guardian_id == guardian.id, StudentGuardian.status == "active"
        )
    ).all())


def accessible_student_ids(db: Session, user: User) -> set[uuid.UUID] | None:
    """None means unrestricted (global admins)."""
    if is_global(user):
        return None
    role = user.role
    if role == Role.STUDENT:
        return {student_for_user(db, user).id}
    if role == Role.GUARDIAN:
        return guardian_student_ids(db, guardian_for_user(db, user))
    if role in (Role.MENTOR, Role.TEACHER):
        mentor = mentor_for_user(db, user)
        ids = mentor_student_ids(db, mentor)
        if role == Role.TEACHER and user.institution_id:
            ids |= set(db.scalars(select(Student.id).where(Student.institution_id == user.institution_id,
                                                         Student.deleted_at.is_(None))).all())
        return ids
    if role == Role.INSTITUTION_ADMIN:
        if user.institution_id is None:
            return set()
        return set(db.scalars(select(Student.id).where(Student.institution_id == user.institution_id,
                                                     Student.deleted_at.is_(None))).all())
    return set()


def ensure_student_access(db: Session, user: User, student_id: uuid.UUID, *, write: bool = False) -> Student:
    student = db.get(Student, student_id)
    if student is None or student.deleted_at is not None:
        raise NotFound("Student not found")
    allowed = accessible_student_ids(db, user)
    if allowed is not None and student.id not in allowed:
        # Same response for "not yours" and "missing" would leak less, but 403 is clearer for UX
        raise Forbidden("You are not authorised to access this student's records")
    if write and user.role == Role.GUARDIAN:
        raise Forbidden("Guardians have read-only access to learning records")
    return student


def resolve_student(db: Session, user: User, student_id: uuid.UUID | None) -> Student:
    """`student_id` omitted -> the caller's own student profile."""
    if student_id is None:
        if user.role != Role.STUDENT:
            raise Forbidden("student_id is required for this role")
        return student_for_user(db, user)
    return ensure_student_access(db, user, student_id)
