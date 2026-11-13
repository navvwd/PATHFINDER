from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select

from ...core.config import get_settings
from ...core.deps import DB, CurrentUser, rate_limit
from ...core.errors import NotFound, Unauthorized
from ...core.permissions import GLOBAL_ROLES, STAFF_ROLES, Role, permissions_for
from ...core.security import utcnow
from ...models import Guardian, Mentor, Student, UserSession
from ...schemas.auth import (
    ChangePassword,
    ForgotPassword,
    GuardianRegister,
    LoginRequest,
    MeOut,
    RefreshRequest,
    ResetPassword,
    SessionOut,
    StudentRegister,
    TokenPair,
    UserOut,
)
from ...schemas.common import Message
from ...services import auth as svc

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()
COOKIE = "pf_refresh"
auth_limit = rate_limit("auth", settings.AUTH_RATE_LIMIT_PER_MINUTE)
refresh_limit = rate_limit("refresh", settings.AUTH_RATE_LIMIT_PER_MINUTE * 6)


def _set_cookie(resp: Response, token: str, remember: bool = True) -> None:
    # httpOnly + SameSite=Strict + path-scoped: JS can't read it and cross-site requests can't send it (CSRF).
    # Without "remember me" it is a browser-session cookie (no max_age) backed by a 12h server session.
    resp.set_cookie(COOKIE, token, httponly=True, secure=settings.COOKIE_SECURE, samesite="strict",
                    max_age=settings.REFRESH_TOKEN_DAYS * 86400 if remember else None, path=f"{settings.API_PREFIX}/auth")


def _tokens(resp: Response, client: str, access: str, expires_in: int, refresh: str, remember: bool = True) -> TokenPair:
    if client == "web":
        _set_cookie(resp, refresh, remember)
        return TokenPair(access_token=access, expires_in=expires_in)
    return TokenPair(access_token=access, expires_in=expires_in, refresh_token=refresh)


@router.post("/register/student", response_model=TokenPair, status_code=201, dependencies=[Depends(auth_limit)])
def register_student(data: StudentRegister, request: Request, response: Response, db: DB):
    user = svc.register_student(db, data, request)
    access, exp, refresh = svc.issue_tokens(db, user, "web", request)
    db.commit()
    return _tokens(response, "web", access, exp, refresh)


@router.post("/register/guardian", response_model=TokenPair, status_code=201, dependencies=[Depends(auth_limit)])
def register_guardian(data: GuardianRegister, request: Request, response: Response, db: DB):
    user = svc.register_guardian(db, data, request)
    access, exp, refresh = svc.issue_tokens(db, user, "web", request)
    db.commit()
    return _tokens(response, "web", access, exp, refresh)


@router.post("/login", response_model=TokenPair, dependencies=[Depends(auth_limit)])
def login(data: LoginRequest, request: Request, response: Response, db: DB):
    user = svc.authenticate(db, data.identifier, data.password, request)
    access, exp, refresh = svc.issue_tokens(db, user, data.client, request, data.remember_me)
    db.commit()
    return _tokens(response, data.client, access, exp, refresh, data.remember_me)


@router.post("/refresh", response_model=TokenPair, dependencies=[Depends(refresh_limit)])
def refresh(request: Request, response: Response, db: DB, data: RefreshRequest | None = None):
    token = (data.refresh_token if data else None) or request.cookies.get(COOKIE)
    client = "mobile" if data and data.refresh_token else "web"
    if not token:
        raise Unauthorized("No session", code="invalid_refresh")
    if client == "web" and request.headers.get("x-requested-with") != "pathfinder":
        # Cookie-based refresh requires a custom header that cross-site forms cannot set.
        raise Unauthorized("Missing anti-CSRF header", code="csrf")
    _, access, exp, new_refresh, remember = svc.rotate_refresh(db, token, request)
    db.commit()
    return _tokens(response, client, access, exp, new_refresh, remember)


@router.post("/logout", response_model=Message)
def logout(request: Request, response: Response, db: DB, data: RefreshRequest | None = None):
    token = (data.refresh_token if data else None) or request.cookies.get(COOKIE)
    if token:
        svc.revoke_session(db, token)
        db.commit()
    response.delete_cookie(COOKIE, path=f"{settings.API_PREFIX}/auth")
    return Message(message="Signed out")


@router.post("/logout-all", response_model=Message)
def logout_all(user: CurrentUser, response: Response, db: DB):
    svc.revoke_all(db, user)
    db.commit()
    response.delete_cookie(COOKIE, path=f"{settings.API_PREFIX}/auth")
    return Message(message="Signed out of all devices")


@router.post("/password/forgot", status_code=202, dependencies=[Depends(auth_limit)])
def forgot_password(data: ForgotPassword, request: Request, db: DB):
    token = svc.start_password_reset(db, data.identifier, request)
    db.commit()
    body: dict = {"message": "If an account exists, password reset instructions have been sent."}
    if token and settings.ENVIRONMENT in ("development", "test"):
        body["debug_reset_token"] = token  # never returned in staging/production
    return body


@router.post("/password/reset", response_model=Message, dependencies=[Depends(auth_limit)])
def reset_password(data: ResetPassword, request: Request, db: DB):
    svc.complete_password_reset(db, data.token, data.new_password, request)
    db.commit()
    return Message(message="Password updated. Please sign in.")


@router.post("/password/change", response_model=Message)
def change_password(data: ChangePassword, user: CurrentUser, request: Request, db: DB):
    svc.change_password(db, user, data.current_password, data.new_password, request)
    db.commit()
    return Message(message="Password changed. Other sessions were signed out.")


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser, db: DB):
    out = MeOut(user=UserOut.model_validate(user), permissions=permissions_for(user.role), ui_mode="staff")
    if user.role == Role.STUDENT:
        s = db.scalar(select(Student).where(Student.user_id == user.id))
        if s:
            out.student_id = s.id
            out.ui_mode = "junior" if (s.age_group and s.age_group.ui_mode == "junior") else "senior"
            out.onboarding_complete = s.onboarding_completed_at is not None
            out.consent_status = s.consent_status
    elif user.role == Role.GUARDIAN:
        g = db.scalar(select(Guardian).where(Guardian.user_id == user.id))
        out.guardian_id = g.id if g else None
        out.ui_mode = "guardian"
    elif user.role in {r.value for r in STAFF_ROLES}:
        m = db.scalar(select(Mentor).where(Mentor.user_id == user.id))
        out.mentor_id = m.id if m else None
        out.ui_mode = "admin" if user.role in {r.value for r in GLOBAL_ROLES} or user.role == Role.INSTITUTION_ADMIN else "staff"
    return out


@router.get("/sessions", response_model=list[SessionOut])
def sessions(user: CurrentUser, db: DB):
    return db.scalars(select(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None),
                                                UserSession.expires_at > utcnow())
                      .order_by(UserSession.created_at.desc())).all()


@router.delete("/sessions/{session_id}", response_model=Message)
def revoke(session_id: uuid.UUID, user: CurrentUser, db: DB):
    sess = db.get(UserSession, session_id)
    if sess is None or sess.user_id != user.id:
        raise NotFound("Session not found")
    sess.revoked_at = utcnow()
    db.commit()
    return Message(message="Session revoked")
