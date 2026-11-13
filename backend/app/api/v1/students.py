from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, select

from ...core.deps import DB, CurrentUser, Paging, require_permission
from ...core.errors import Forbidden
from ...core.permissions import P, Role
from ...models import Student, User
from ...repositories.base import paginate
from ...schemas.common import Page
from ...schemas.student import (
    AcademicProfileIn,
    DashboardOut,
    GoalsIn,
    GuardianStepIn,
    InterestProfileIn,
    OnboardingStatus,
    StudentOut,
    StudentProfileUpdate,
    StudentSummary,
)
from ...services import students as svc
from ...services.access import accessible_student_ids, ensure_student_access, student_for_user
from ...services.audit import audit
from ...services.auth import age_on

router = APIRouter(prefix="/students", tags=["students"])
student_only = require_permission(P.PROFILE_UPDATE_SELF, P.INTERESTS_MANAGE_SELF)


@router.get("", response_model=Page[StudentSummary])
def list_students(user: CurrentUser, db: DB, paging: Paging, age_group: str | None = Query(None, max_length=20),
                  institution_id: uuid.UUID | None = None):
    if user.role == Role.STUDENT:
        raise Forbidden("Students cannot list other students")
    ids = accessible_student_ids(db, user)
    stmt = select(Student).join(User, User.id == Student.user_id).where(Student.deleted_at.is_(None))
    if ids is not None:
        stmt = stmt.where(Student.id.in_(ids or [uuid.uuid4()]))
    if institution_id:
        stmt = stmt.where(Student.institution_id == institution_id)
    if paging.q:
        like = f"%{paging.q.lower()}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), Student.school_name.ilike(like)))
    if age_group:
        from ...models import AgeGroup
        stmt = stmt.join(AgeGroup, AgeGroup.id == Student.age_group_id).where(AgeGroup.code == age_group)
    stmt = stmt.order_by(User.full_name)
    page = paginate(db, stmt, paging, Student, {"xp", "created_at"})
    page["items"] = [svc.student_summary(s) for s in page["items"]]
    return page


@router.get("/me", response_model=StudentOut)
def me(user: CurrentUser, db: DB):
    return svc.student_out(student_for_user(db, user))


@router.patch("/me", response_model=StudentOut)
def update_me(data: StudentProfileUpdate, request: Request, db: DB, user: User = Depends(student_only)):
    s = student_for_user(db, user)
    changes = data.model_dump(exclude_unset=True)
    if "full_name" in changes:
        user.full_name = changes.pop("full_name")
    for k, v in changes.items():
        setattr(s, k, v)
    audit(db, "student.profile_updated", actor=user, entity_type="student", entity_id=s.id, request=request,
          details={"fields": sorted(data.model_dump(exclude_unset=True))})
    db.commit()
    return svc.student_out(s)


@router.get("/me/onboarding", response_model=OnboardingStatus)
def onboarding(user: CurrentUser, db: DB):
    return svc.onboarding_status(student_for_user(db, user))


@router.put("/me/onboarding/academic", response_model=OnboardingStatus)
def onboarding_academic(data: AcademicProfileIn, db: DB, user: User = Depends(student_only)):
    s = student_for_user(db, user)
    svc.save_academic(db, s, data)
    db.commit()
    return svc.onboarding_status(s)


@router.put("/me/onboarding/interests", response_model=OnboardingStatus)
def onboarding_interests(data: InterestProfileIn, db: DB, user: User = Depends(student_only)):
    s = student_for_user(db, user)
    svc.save_interests(db, s, data)
    db.commit()
    return svc.onboarding_status(s)


@router.put("/me/onboarding/goals", response_model=OnboardingStatus)
def onboarding_goals(data: GoalsIn, db: DB, user: User = Depends(student_only)):
    s = student_for_user(db, user)
    svc.save_goals(s, data)
    db.commit()
    return svc.onboarding_status(s)


@router.put("/me/onboarding/guardian", response_model=OnboardingStatus)
def onboarding_guardian(data: GuardianStepIn, db: DB, user: User = Depends(student_only)):
    """Student acknowledges they shared the invite code (minors) or confirms they are an adult."""
    s = student_for_user(db, user)
    if data.action == "skip_adult" and svc.requires_guardian(s):
        raise Forbidden("Students under 18 need a guardian to give consent")
    svc.mark_step(s, "guardian")
    db.commit()
    return svc.onboarding_status(s)


@router.post("/me/onboarding/complete", response_model=OnboardingStatus)
def onboarding_complete(db: DB, user: User = Depends(student_only)):
    s = student_for_user(db, user)
    status = svc.complete_onboarding(db, s)
    db.commit()
    return status


@router.post("/me/guardian-invite", response_model=OnboardingStatus)
def regenerate_invite(db: DB, user: User = Depends(student_only)):
    from ...services.auth import new_invite_code

    s = student_for_user(db, user)
    s.guardian_invite_code = new_invite_code(db)
    db.commit()
    return svc.onboarding_status(s)


@router.get("/me/dashboard", response_model=DashboardOut)
def my_dashboard(user: CurrentUser, db: DB):
    s = student_for_user(db, user)
    data = svc.build_dashboard(db, s)
    db.commit()
    return data


@router.get("/{student_id}", response_model=StudentOut)
def get_student(student_id: uuid.UUID, user: CurrentUser, db: DB):
    return svc.student_out(ensure_student_access(db, user, student_id))


@router.get("/{student_id}/dashboard", response_model=DashboardOut)
def student_dashboard(student_id: uuid.UUID, user: CurrentUser, db: DB):
    s = ensure_student_access(db, user, student_id)
    data = svc.build_dashboard(db, s)
    db.commit()
    return data


