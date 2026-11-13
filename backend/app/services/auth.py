from __future__ import annotations

import secrets
import string
import uuid
from datetime import date, timedelta

from fastapi import Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.errors import Conflict, Forbidden, Unauthorized, ValidationFailed
from ..core.permissions import Role
from ..core.security import (
    create_access_token,
    hash_password,
    hash_token,
    needs_rehash,
    new_opaque_token,
    password_strength_errors,
    utcnow,
    verify_password,
)
from ..models import (
    AgeGroup,
    Guardian,
    Institution,
    PasswordResetToken,
    Portfolio,
    Student,
    StudentGuardian,
    User,
    UserSession,
)
from .audit import audit
from .gamification import ensure_default_goals
from .notify import notify


def age_on(dob: date, today: date | None = None) -> int:
    today = today or date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def age_group_for(db: Session, dob: date) -> AgeGroup | None:
    age = age_on(dob)
    return db.scalar(select(AgeGroup).where(AgeGroup.is_active.is_(True), AgeGroup.min_age <= age,
                                            AgeGroup.max_age >= age).order_by(AgeGroup.sort_order))


def _check_password(pw: str) -> None:
    errs = password_strength_errors(pw)
    if errs:
        raise ValidationFailed("Password must contain " + ", ".join(errs), code="weak_password")


def _ensure_unique(db: Session, email: str | None, phone: str | None) -> None:
    conds = []
    if email:
        conds.append(User.email == email.lower())
    if phone:
        conds.append(User.phone == phone)
    if conds and db.scalar(select(User.id).where(or_(*conds))):
        raise Conflict("An account with this email or mobile number already exists", code="account_exists")


def new_invite_code(db: Session) -> str:
    alphabet = string.ascii_uppercase + string.digits
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(8))
        if not db.scalar(select(Student.id).where(Student.guardian_invite_code == code)):
            return code


def create_user(db: Session, *, full_name: str, email: str | None, phone: str | None, password: str, role: str,
                institution_id: uuid.UUID | None = None) -> User:
    _check_password(password)
    _ensure_unique(db, email, phone)
    user = User(full_name=full_name, email=email.lower() if email else None, phone=phone,
                password_hash=hash_password(password), role=role, institution_id=institution_id,
                preferences={"theme": "system"})
    db.add(user)
    db.flush()
    return user


def register_student(db: Session, data, request: Request | None = None) -> User:
    institution_id = None
    if data.institution_code:
        inst = db.scalar(select(Institution).where(Institution.code == data.institution_code.upper(),
                                                   Institution.is_active.is_(True), Institution.deleted_at.is_(None)))
        if inst is None:
            raise ValidationFailed("Institution code not recognised", code="invalid_institution_code")
        institution_id = inst.id
    user = create_user(db, full_name=data.full_name, email=data.email, phone=data.phone, password=data.password,
                       role=Role.STUDENT, institution_id=institution_id)
    s = get_settings()
    minor = age_on(data.date_of_birth) < s.CONSENT_REQUIRED_UNDER_AGE
    student = Student(user_id=user.id, date_of_birth=data.date_of_birth, institution_id=institution_id,
                      age_group_id=(ag.id if (ag := age_group_for(db, data.date_of_birth)) else None),
                      consent_status="pending" if minor else "not_required",
                      guardian_invite_code=new_invite_code(db), onboarding_steps_completed=["account"])
    db.add(student)
    db.flush()
    db.add(Portfolio(student_id=student.id, title=f"{user.first_name}'s Portfolio"))
    ensure_default_goals(db, student)
    notify(db, user.id, "welcome", "Welcome to PathFinder AI!", "Start by telling us what you enjoy.", "/app/onboarding")
    audit(db, "auth.register", actor=user, entity_type="user", entity_id=user.id, category="security", request=request,
          details={"role": "student", "minor": minor})
    return user


def register_guardian(db: Session, data, request: Request | None = None) -> User:
    user = create_user(db, full_name=data.full_name, email=data.email, phone=data.phone, password=data.password,
                       role=Role.GUARDIAN)
    guardian = Guardian(user_id=user.id)
    db.add(guardian)
    db.flush()
    if data.student_invite_code:
        link_guardian(db, guardian, data.student_invite_code, "parent")
    audit(db, "auth.register", actor=user, entity_type="user", entity_id=user.id, category="security", request=request,
          details={"role": "guardian"})
    return user


def link_guardian(db: Session, guardian: Guardian, invite_code: str, relationship: str) -> Student:
    student = db.scalar(select(Student).where(Student.guardian_invite_code == invite_code.strip().upper(),
                                              Student.deleted_at.is_(None)))
    if student is None:
        raise ValidationFailed("Invite code not recognised", code="invalid_invite_code")
    existing = db.scalar(select(StudentGuardian).where(StudentGuardian.student_id == student.id,
                                                       StudentGuardian.guardian_id == guardian.id))
    if existing:
        existing.status = "active"
    else:
        has_primary = db.scalar(select(StudentGuardian.id).where(StudentGuardian.student_id == student.id,
                                                                 StudentGuardian.status == "active"))
        db.add(StudentGuardian(student_id=student.id, guardian_id=guardian.id, relationship_type=relationship,
                               status="active", is_primary=not has_primary, linked_at=utcnow()))
    if "guardian" not in (student.onboarding_steps_completed or []):
        student.onboarding_steps_completed = [*student.onboarding_steps_completed, "guardian"]
    notify(db, student.user_id, "guardian_linked", "A guardian linked to your account",
           f"{guardian.user.full_name} can now support your journey.", "/app/settings")
    return student


def find_user_by_identifier(db: Session, identifier: str) -> User | None:
    ident = identifier.strip()
    stmt = select(User).where(User.deleted_at.is_(None))
    if "@" in ident:
        return db.scalar(stmt.where(User.email == ident.lower()))
    return db.scalar(stmt.where(User.phone == ident.replace(" ", "").replace("-", "")))


def authenticate(db: Session, identifier: str, password: str, request: Request | None = None) -> User:
    s = get_settings()
    user = find_user_by_identifier(db, identifier)
    now = utcnow()
    if user is None:
        verify_password(password, "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$ZmFrZWhhc2g")  # equalise timing
        audit(db, "auth.login_failed", category="security", request=request, details={"reason": "unknown_identifier"})
        db.commit()
        raise Unauthorized("Incorrect credentials", code="invalid_credentials")
    if user.locked_until and user.locked_until > now:
        raise Forbidden("Account temporarily locked after repeated failed attempts. Try again later.", code="account_locked")
    if not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        if user.failed_login_count >= s.MAX_FAILED_LOGINS:
            user.locked_until = now + timedelta(minutes=s.LOCKOUT_MINUTES)
            user.failed_login_count = 0
        audit(db, "auth.login_failed", actor=user, category="security", request=request, details={"reason": "bad_password"})
        db.commit()
        raise Unauthorized("Incorrect credentials", code="invalid_credentials")
    if not user.is_active:
        raise Forbidden("This account is deactivated", code="account_inactive")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    audit(db, "auth.login", actor=user, category="security", request=request)
    return user


def issue_tokens(db: Session, user: User, client: str, request: Request | None = None) -> tuple[str, int, str]:
    s = get_settings()
    access, expires_in = create_access_token(user.id, user.role, user.institution_id, user.token_version)
    refresh = new_opaque_token()
    db.add(UserSession(user_id=user.id, refresh_token_hash=hash_token(refresh), client=client,
                       user_agent=(request.headers.get("user-agent", "")[:300] if request else None),
                       ip_address=(request.client.host if request and request.client else None),
                       expires_at=utcnow() + timedelta(days=s.REFRESH_TOKEN_DAYS), last_used_at=utcnow()))
    return access, expires_in, refresh


def rotate_refresh(db: Session, refresh: str, request: Request | None = None) -> tuple[User, str, int, str]:
    sess = db.scalar(select(UserSession).where(UserSession.refresh_token_hash == hash_token(refresh)))
    now = utcnow()
    if sess is None:
        raise Unauthorized("Invalid refresh token", code="invalid_refresh")
    if sess.revoked_at is not None:
        # Reuse of a rotated token: likely theft -> revoke every session of this user.
        user = db.get(User, sess.user_id)
        if user:
            revoke_all(db, user)
            audit(db, "auth.refresh_reuse_detected", actor=user, category="security", request=request)
            db.commit()
        raise Unauthorized("Session expired, please sign in again", code="invalid_refresh")
    if sess.expires_at <= now:
        raise Unauthorized("Session expired, please sign in again", code="invalid_refresh")
    user = db.get(User, sess.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        raise Unauthorized("Account is not active")
    sess.revoked_at = now
    access, expires_in, new_refresh = issue_tokens(db, user, sess.client, request)
    return user, access, expires_in, new_refresh


def revoke_session(db: Session, refresh: str) -> None:
    sess = db.scalar(select(UserSession).where(UserSession.refresh_token_hash == hash_token(refresh)))
    if sess and sess.revoked_at is None:
        sess.revoked_at = utcnow()


def revoke_all(db: Session, user: User) -> None:
    user.token_version += 1
    for sess in db.scalars(select(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))):
        sess.revoked_at = utcnow()


def start_password_reset(db: Session, identifier: str, request: Request | None = None) -> str | None:
    user = find_user_by_identifier(db, identifier)
    if user is None:
        return None
    token = new_opaque_token()
    db.add(PasswordResetToken(user_id=user.id, token_hash=hash_token(token),
                              expires_at=utcnow() + timedelta(minutes=get_settings().PASSWORD_RESET_MINUTES)))
    audit(db, "auth.password_reset_requested", actor=user, category="security", request=request)
    # Delivery (email/SMS) is pluggable; dev/test return the token so the flow is testable end-to-end.
    return token


def complete_password_reset(db: Session, token: str, new_password: str, request: Request | None = None) -> None:
    row = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(token)))
    if row is None or row.used_at is not None or row.expires_at <= utcnow():
        raise ValidationFailed("Reset link is invalid or has expired", code="invalid_reset_token")
    _check_password(new_password)
    user = db.get(User, row.user_id)
    user.password_hash = hash_password(new_password)
    user.failed_login_count = 0
    user.locked_until = None
    row.used_at = utcnow()
    revoke_all(db, user)
    audit(db, "auth.password_reset", actor=user, category="security", request=request)


def change_password(db: Session, user: User, current: str, new: str, request: Request | None = None) -> None:
    if not verify_password(current, user.password_hash):
        raise ValidationFailed("Current password is incorrect", code="invalid_password")
    _check_password(new)
    user.password_hash = hash_password(new)
    revoke_all(db, user)
    audit(db, "auth.password_changed", actor=user, category="security", request=request)
