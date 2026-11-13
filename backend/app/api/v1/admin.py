"""User management, privacy rights (export / deletion) and admin / super-admin consoles."""

from __future__ import annotations

import platform
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select, text

from ...core.config import get_settings
from ...core.deps import DB, CurrentUser, Paging, is_global, require_permission
from ...core.errors import Forbidden, NotFound, ValidationFailed
from ...core.permissions import P, Role
from ...core.ratelimit import limiter
from ...core.security import utcnow
from ...models import (
    AIUsageLog,
    AuditLog,
    ConsentRecord,
    FeatureFlag,
    Guardian,
    Institution,
    InterestHistory,
    Mentor,
    MentorFeedback,
    ProgressEvent,
    Student,
    StudentInterest,
    Submission,
    SubscriptionPlan,
    SystemSetting,
    User,
)
from ...repositories.base import paginate
from ...schemas.auth import UserOut
from ...schemas.common import Message, Page
from ...services.audit import audit
from ...services.auth import create_user, revoke_all

router = APIRouter(tags=["admin"])

ASSIGNABLE = {
    Role.SUPER_ADMIN: {r.value for r in Role},
    Role.PLATFORM_ADMIN: {"student", "guardian", "teacher", "mentor", "institution_admin"},
    Role.INSTITUTION_ADMIN: {"teacher", "mentor"},
}


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str
    institution_id: uuid.UUID | None = None


class UserAdminUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    is_active: bool | None = None
    role: str | None = None
    institution_id: uuid.UUID | None = None


class MeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    theme: str | None = Field(default=None, pattern="^(light|dark|system)$")


class DeleteMe(BaseModel):
    confirm: str = Field(pattern="^DELETE$")


# ============================ users ============================

@router.patch("/users/me", response_model=UserOut)
def update_me(data: MeUpdate, user: CurrentUser, db: DB):
    if data.full_name:
        user.full_name = data.full_name
    if data.theme:
        user.preferences = {**(user.preferences or {}), "theme": data.theme}
    db.commit()
    return user


@router.get("/users/me/export")
def export_my_data(user: CurrentUser, request: Request, db: DB):
    """Data portability (DPDP Act right to information): everything we hold about the caller."""
    out: dict = {"user": UserOut.model_validate(user).model_dump(mode="json"), "exported_at": utcnow().isoformat()}
    s = db.scalar(select(Student).where(Student.user_id == user.id))
    if s:
        from ...services.students import student_out
        out["student_profile"] = student_out(s).model_dump(mode="json")
        out["interests"] = [{"domain_id": str(i.domain_id), "subdomain_id": str(i.subdomain_id) if i.subdomain_id else None,
                             "strength": i.strength, "active": i.is_active}
                            for i in db.scalars(select(StudentInterest).where(StudentInterest.student_id == s.id))]
        out["interest_history"] = [{"action": h.action, "domain_id": str(h.domain_id) if h.domain_id else None,
                                    "at": h.created_at.isoformat()}
                                   for h in db.scalars(select(InterestHistory).where(InterestHistory.student_id == s.id))]
        out["progress_events"] = [{"type": e.event_type, "score_pct": e.score_pct, "at": e.occurred_at.isoformat(),
                                   "payload": e.payload}
                                  for e in db.scalars(select(ProgressEvent).where(ProgressEvent.student_id == s.id))]
        out["submissions"] = [{"activity_id": str(x.activity_id), "text": x.content_text, "reflection": x.reflection,
                               "submitted_at": x.submitted_at.isoformat()}
                              for x in db.scalars(select(Submission).where(Submission.student_id == s.id))]
        out["mentor_feedback"] = [{"content": f.content, "at": f.created_at.isoformat()}
                                  for f in db.scalars(select(MentorFeedback).where(MentorFeedback.student_id == s.id,
                                                                                   MentorFeedback.visible_to_student.is_(True)))]
        out["consents"] = [{"type": c.consent_type, "granted": c.granted, "at": c.created_at.isoformat()}
                           for c in db.scalars(select(ConsentRecord).where(ConsentRecord.student_id == s.id))]
    audit(db, "privacy.data_exported", actor=user, category="security", request=request)
    db.commit()
    return out


@router.post("/users/me/delete", response_model=Message)
def delete_me(data: DeleteMe, user: CurrentUser, request: Request, db: DB):
    """Account deletion: immediate deactivation + anonymisation of direct identifiers.
    Learning records are purged after the retention window by scripts/purge_deleted.py."""
    if user.role in (Role.SUPER_ADMIN,):
        raise Forbidden("Super admin accounts cannot self-delete")
    now = utcnow()
    tag = user.id.hex[:12]
    user.deleted_at, user.is_active = now, False
    user.full_name, user.email, user.phone = "Deleted user", f"deleted-{tag}@invalid.local", None
    revoke_all(db, user)
    for model in (Student, Guardian, Mentor):
        row = db.scalar(select(model).where(model.user_id == user.id))
        if row:
            row.deleted_at = now
            if isinstance(row, Student):
                row.guardian_invite_code = None
                row.aspirations = None
                row.hobbies = row.personal_interests = row.favourite_subjects = []
    audit(db, "privacy.account_deleted", actor=user, category="security", request=request,
          details={"purge_after_days": get_settings().DATA_RETENTION_DAYS_AFTER_DELETION})
    db.commit()
    return Message(message="Your account has been deleted. Remaining records will be purged after the retention period.")


@router.get("/users", response_model=Page[UserOut])
def list_users(db: DB, paging: Paging, role: str | None = Query(None, max_length=30),
               institution_id: uuid.UUID | None = None, include_deleted: bool = False,
               user: User = Depends(require_permission(P.INSTITUTION_USERS_MANAGE))):
    stmt = select(User)
    if not include_deleted:
        stmt = stmt.where(User.deleted_at.is_(None))
    if not is_global(user):
        stmt = stmt.where(User.institution_id == user.institution_id)
    elif institution_id:
        stmt = stmt.where(User.institution_id == institution_id)
    if role:
        stmt = stmt.where(User.role == role)
    if paging.q:
        like = f"%{paging.q}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like)))
    if not paging.sort:
        stmt = stmt.order_by(User.created_at.desc())
    return paginate(db, stmt, paging, User, {"full_name", "created_at", "last_login_at", "role"})


@router.post("/users", response_model=UserOut, status_code=201)
def admin_create_user(data: UserCreate, request: Request, db: DB,
                      user: User = Depends(require_permission(P.INSTITUTION_USERS_MANAGE))):
    allowed = ASSIGNABLE.get(Role(user.role), set())
    if data.role not in allowed:
        raise Forbidden(f"You cannot create '{data.role}' accounts")
    inst_id = data.institution_id if is_global(user) else user.institution_id
    if data.role in ("student",):
        raise ValidationFailed("Create students via registration or institution CSV import")
    u = create_user(db, full_name=data.full_name, email=data.email, phone=None, password=data.password, role=data.role,
                    institution_id=inst_id)
    u.is_verified = True
    if data.role in ("teacher", "mentor", "institution_admin", "platform_admin", "super_admin"):
        db.add(Mentor(user_id=u.id, kind="teacher" if data.role == "teacher" else "mentor", institution_id=inst_id))
    if data.role == "guardian":
        db.add(Guardian(user_id=u.id))
    audit(db, "user.created", actor=user, entity_type="user", entity_id=u.id, category="admin", request=request,
          details={"role": data.role})
    db.commit()
    return u


def _managed_user(db, actor: User, user_id: uuid.UUID) -> User:
    u = db.get(User, user_id)
    if u is None:
        raise NotFound("User not found")
    if not is_global(actor) and u.institution_id != actor.institution_id:
        raise NotFound("User not found")
    if u.role == Role.SUPER_ADMIN and actor.role != Role.SUPER_ADMIN:
        raise Forbidden("Cannot manage a super admin")
    return u


@router.get("/users/{user_id}", response_model=UserOut)
def get_user(user_id: uuid.UUID, db: DB, user: User = Depends(require_permission(P.INSTITUTION_USERS_MANAGE))):
    return _managed_user(db, user, user_id)


@router.patch("/users/{user_id}", response_model=UserOut)
def admin_update_user(user_id: uuid.UUID, data: UserAdminUpdate, request: Request, db: DB,
                      user: User = Depends(require_permission(P.INSTITUTION_USERS_MANAGE))):
    u = _managed_user(db, user, user_id)
    if u.id == user.id and (data.is_active is False or data.role):
        raise Forbidden("You cannot deactivate or change the role of your own account")
    changes = data.model_dump(exclude_unset=True)
    if "role" in changes and changes["role"] not in ASSIGNABLE.get(Role(user.role), set()):
        raise Forbidden("You cannot assign that role")
    if "institution_id" in changes and not is_global(user):
        raise Forbidden("Only platform administrators can move users between institutions")
    for k, v in changes.items():
        setattr(u, k, v)
    if data.is_active is False or "role" in changes:
        revoke_all(db, u)
    audit(db, "user.updated", actor=user, entity_type="user", entity_id=u.id, category="admin", request=request,
          details={k: str(v) for k, v in changes.items()})
    db.commit()
    return u


@router.delete("/users/{user_id}", response_model=Message)
def admin_delete_user(user_id: uuid.UUID, request: Request, db: DB, user: User = Depends(require_permission(P.USERS_MANAGE))):
    u = _managed_user(db, user, user_id)
    if u.id == user.id:
        raise Forbidden("Use the self-service deletion flow for your own account")
    u.deleted_at, u.is_active = utcnow(), False
    revoke_all(db, u)
    audit(db, "user.deleted", actor=user, entity_type="user", entity_id=u.id, category="admin", request=request)
    db.commit()
    return Message(message="User deactivated and scheduled for purge")


# ============================ admin consoles ============================

class FlagIn(BaseModel):
    enabled: bool
    description: str | None = Field(default=None, max_length=500)
    rules: dict = {}


class SettingIn(BaseModel):
    value: dict


class PlanIn(BaseModel):
    code: str = Field(pattern=r"^[a-z0-9_-]{2,30}$")
    name: str = Field(min_length=2, max_length=100)
    max_students: int = Field(ge=1, le=1_000_000)
    price_inr_per_year: int = Field(ge=0)
    features: dict = {}
    is_active: bool = True


SETTING_KEYS = {"global", "ai", "privacy", "branding"}


@router.get("/admin/overview")
def overview(db: DB, user: User = Depends(require_permission(P.USERS_MANAGE))):
    since = utcnow() - timedelta(days=7)
    return {
        "users": dict(db.execute(select(User.role, func.count()).where(User.deleted_at.is_(None)).group_by(User.role)).all()),
        "institutions": {"active": db.scalar(select(func.count()).select_from(Institution).where(Institution.is_active.is_(True), Institution.deleted_at.is_(None))),
                         "pending": db.scalar(select(func.count()).select_from(Institution).where(Institution.is_active.is_(False), Institution.deleted_at.is_(None)))},
        "signups_7d": db.scalar(select(func.count()).select_from(User).where(User.created_at >= since)),
        "security_events_7d": db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.category == "security", AuditLog.created_at >= since)),
        "ai_requests_7d": db.scalar(select(func.count()).select_from(AIUsageLog).where(AIUsageLog.created_at >= since)),
    }


@router.get("/admin/audit-logs")
def audit_logs(db: DB, paging: Paging, category: str | None = Query(None, pattern="^(data|security|admin|ai)$"),
               action: str | None = Query(None, max_length=80), user: User = Depends(require_permission(P.AUDIT_VIEW))):
    stmt = select(AuditLog)
    if category:
        stmt = stmt.where(AuditLog.category == category)
    if action:
        stmt = stmt.where(AuditLog.action.ilike(f"{action}%"))
    page = paginate(db, stmt.order_by(AuditLog.created_at.desc()), paging, AuditLog, set())
    names = dict(db.execute(select(User.id, User.full_name).where(User.id.in_({a.actor_user_id for a in page["items"] if a.actor_user_id}))).all()) if page["items"] else {}
    page["items"] = [{"id": str(a.id), "action": a.action, "category": a.category, "actor": names.get(a.actor_user_id),
                      "entity_type": a.entity_type, "entity_id": a.entity_id, "ip_address": a.ip_address,
                      "details": a.details, "created_at": a.created_at.isoformat()} for a in page["items"]]
    return page


@router.get("/admin/feature-flags")
def flags(db: DB, user: User = Depends(require_permission(P.FEATURE_FLAGS_MANAGE))):
    return [{"key": f.key, "enabled": f.enabled, "description": f.description, "rules": f.rules}
            for f in db.scalars(select(FeatureFlag).order_by(FeatureFlag.key))]


@router.get("/admin/feature-flags/public")
def public_flags(db: DB, user: CurrentUser):
    return {f.key: f.enabled for f in db.scalars(select(FeatureFlag))}


@router.put("/admin/feature-flags/{key}")
def set_flag(key: str, data: FlagIn, request: Request, db: DB, user: User = Depends(require_permission(P.FEATURE_FLAGS_MANAGE))):
    if not key.replace("_", "").isalnum() or len(key) > 60:
        raise ValidationFailed("Invalid flag key")
    f = db.scalar(select(FeatureFlag).where(FeatureFlag.key == key)) or FeatureFlag(key=key)
    f.enabled, f.description, f.rules = data.enabled, data.description or f.description, data.rules
    db.add(f)
    audit(db, "feature_flag.set", actor=user, entity_type="feature_flag", entity_id=key, category="admin", request=request,
          details={"enabled": data.enabled})
    db.commit()
    return {"key": f.key, "enabled": f.enabled}


@router.get("/admin/settings/{key}")
def get_setting(key: str, db: DB, user: User = Depends(require_permission(P.AI_SETTINGS_MANAGE))):
    if key not in SETTING_KEYS:
        raise NotFound("Unknown setting")
    row = db.get(SystemSetting, key)
    return {"key": key, "value": row.value if row else {}}


@router.put("/admin/settings/{key}")
def put_setting(key: str, data: SettingIn, request: Request, db: DB, user: User = Depends(require_permission(P.AI_SETTINGS_MANAGE))):
    if key not in SETTING_KEYS:
        raise NotFound("Unknown setting")
    if key == "ai":
        allowed = {"enabled", "provider", "model", "max_tokens"}
        if set(data.value) - allowed:
            raise ValidationFailed(f"AI settings support: {sorted(allowed)} (API keys stay in server env vars)")
    row = db.get(SystemSetting, key) or SystemSetting(key=key)
    row.value, row.updated_by = data.value, user.id
    db.add(row)
    from ...ai.providers import _provider_cache
    _provider_cache.clear()
    audit(db, "setting.changed", actor=user, entity_type="setting", entity_id=key, category="admin", request=request,
          details=data.value)
    db.commit()
    return {"key": key, "value": row.value}


@router.get("/admin/ai-usage")
def ai_usage(db: DB, days: int = Query(30, ge=1, le=365), user: User = Depends(require_permission(P.SYSTEM_MONITOR))):
    since = utcnow() - timedelta(days=days)
    rows = db.execute(select(AIUsageLog.feature, AIUsageLog.status, func.count(), func.sum(AIUsageLog.input_tokens),
                             func.sum(AIUsageLog.output_tokens), func.avg(AIUsageLog.latency_ms))
                      .where(AIUsageLog.created_at >= since).group_by(AIUsageLog.feature, AIUsageLog.status)).all()
    return {"days": days, "rows": [{"feature": f, "status": st, "requests": n, "input_tokens": int(i or 0),
                                    "output_tokens": int(o or 0), "avg_latency_ms": int(lat or 0)} for f, st, n, i, o, lat in rows]}


@router.get("/admin/system")
def system(db: DB, user: User = Depends(require_permission(P.SYSTEM_MONITOR))):
    s = get_settings()
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    from alembic.runtime.migration import MigrationContext
    try:
        rev = MigrationContext.configure(db.connection()).get_current_revision()
    except Exception:
        rev = None
    return {"environment": s.ENVIRONMENT, "database": {"ok": db_ok, "dialect": db.bind.dialect.name, "migration": rev},
            "rate_limiter": limiter.backend, "python": platform.python_version(),
            "ai_provider": s.AI_PROVIDER, "time": utcnow().isoformat()}


@router.get("/admin/subscription-plans")
def plans(db: DB, user: CurrentUser):
    return [{"code": p.code, "name": p.name, "max_students": p.max_students, "price_inr_per_year": p.price_inr_per_year,
             "features": p.features, "is_active": p.is_active} for p in db.scalars(select(SubscriptionPlan))]


@router.put("/admin/subscription-plans/{code}")
def upsert_plan(code: str, data: PlanIn, db: DB, user: User = Depends(require_permission(P.SUBSCRIPTIONS_MANAGE))):
    if code != data.code:
        raise ValidationFailed("Code mismatch")
    p = db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.code == code)) or SubscriptionPlan(code=code)
    for k, v in data.model_dump().items():
        setattr(p, k, v)
    db.add(p)
    db.commit()
    return {"code": p.code, "name": p.name}


@router.post("/admin/tenants/{inst_id}/approve")
def approve_tenant(inst_id: uuid.UUID, request: Request, db: DB, user: User = Depends(require_permission(P.INSTITUTIONS_MANAGE))):
    inst = db.get(Institution, inst_id)
    if inst is None:
        raise NotFound("Institution not found")
    inst.is_active = True
    for u in db.scalars(select(User).where(User.institution_id == inst.id, User.role == Role.INSTITUTION_ADMIN)):
        u.is_verified = True
        from ...services.notify import notify
        notify(db, u.id, "institution", "Your institution has been approved", inst.name, "/institution")
    audit(db, "institution.approved", actor=user, entity_type="institution", entity_id=inst.id, category="admin", request=request)
    db.commit()
    return {"id": str(inst.id), "is_active": True}
