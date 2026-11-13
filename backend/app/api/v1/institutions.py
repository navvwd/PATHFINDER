"""Institution portal (multi-tenant) and reports."""

from __future__ import annotations

import csv
import io
import re
import secrets
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, Request, UploadFile
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select

from ...core.deps import DB, CurrentUser, Paging, is_global, require_permission
from ...core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from ...core.permissions import P, Role
from ...core.security import utcnow
from ...models import (
    AcademicYear,
    Activity,
    Batch,
    BatchMember,
    Campus,
    Domain,
    DomainScore,
    Enrollment,
    Institution,
    Mentor,
    ProgressEvent,
    Report,
    SchoolClass,
    Student,
    StudentInterest,
    Subscription,
    SubscriptionPlan,
    User,
)
from ...repositories.base import paginate
from ...schemas.common import Page
from ...schemas.growth import ReportGenerate, ReportOut
from ...services import activities as act_svc
from ...services.access import resolve_student
from ...services.audit import audit
from ...services.auth import create_user, register_student
from ...services.scoring import latest_scores

router = APIRouter(tags=["institutions"])


class InstitutionIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(pattern=r"^[A-Za-z0-9-]{3,40}$")
    kind: str = Field(default="school", pattern="^(school|college|coaching|ngo|other)$")
    address: str | None = Field(default=None, max_length=500)
    contact_email: EmailStr | None = None


class InstitutionRegister(InstitutionIn):
    admin_name: str = Field(min_length=2, max_length=150)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8, max_length=128)


class InstitutionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    contact_email: EmailStr | None = None
    is_active: bool | None = None


class CampusIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    address: str | None = Field(default=None, max_length=500)


class YearIn(BaseModel):
    label: str = Field(pattern=r"^\d{4}-\d{2,4}$")
    starts_on: date
    ends_on: date
    is_current: bool = False


class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    grade: str = Field(min_length=1, max_length=20)
    section: str | None = Field(default=None, max_length=20)
    campus_id: uuid.UUID | None = None
    academic_year_id: uuid.UUID | None = None


class StaffIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(teacher|mentor|institution_admin)$")
    expertise_domain_ids: list[uuid.UUID] = []


class AllocationIn(BaseModel):
    mentor_id: uuid.UUID
    student_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    batch_name: str = Field(min_length=2, max_length=120)


class DistributeIn(BaseModel):
    activity_id: uuid.UUID
    class_id: uuid.UUID
    due_at: str | None = None


class SubscriptionIn(BaseModel):
    plan_code: str = Field(max_length=30)
    seats: int = Field(ge=1, le=100000)
    status: str = Field(default="active", pattern="^(trial|active|past_due|cancelled)$")
    ends_on: date | None = None


def _inst(db, user: User, inst_id: uuid.UUID, manage: bool = False) -> Institution:
    inst = db.get(Institution, inst_id)
    if inst is None or inst.deleted_at is not None:
        raise NotFound("Institution not found")
    if not is_global(user):
        if user.institution_id != inst.id:
            raise NotFound("Institution not found")  # tenant isolation: do not reveal other tenants
        if manage and user.role != Role.INSTITUTION_ADMIN:
            raise Forbidden("Institution administrators only")
    return inst


def _inst_out(db, i: Institution) -> dict:
    sub = db.scalar(select(Subscription).where(Subscription.institution_id == i.id).order_by(Subscription.created_at.desc()))
    return {"id": str(i.id), "name": i.name, "code": i.code, "kind": i.kind, "address": i.address,
            "contact_email": i.contact_email, "is_active": i.is_active, "created_at": i.created_at.isoformat(),
            "students": db.scalar(select(func.count()).select_from(Student).where(Student.institution_id == i.id,
                                                                                Student.deleted_at.is_(None))),
            "staff": db.scalar(select(func.count()).select_from(Mentor).where(Mentor.institution_id == i.id,
                                                                            Mentor.deleted_at.is_(None))),
            "subscription": {"plan_code": sub.plan_code, "status": sub.status, "seats": sub.seats,
                             "ends_on": sub.ends_on.isoformat() if sub.ends_on else None} if sub else None}


@router.post("/institutions/register", status_code=201)
def register_institution(data: InstitutionRegister, request: Request, db: DB):
    """Public registration. The institution starts inactive until a platform admin approves it."""
    if db.scalar(select(Institution.id).where(Institution.code == data.code.upper())):
        raise Conflict("Institution code already taken")
    inst = Institution(name=data.name, code=data.code.upper(), kind=data.kind, address=data.address,
                       contact_email=data.contact_email, is_active=False)
    db.add(inst)
    db.flush()
    admin = create_user(db, full_name=data.admin_name, email=data.admin_email, phone=None, password=data.admin_password,
                        role=Role.INSTITUTION_ADMIN, institution_id=inst.id)
    db.add(Mentor(user_id=admin.id, kind="teacher", institution_id=inst.id))
    db.add(Subscription(institution_id=inst.id, plan_code="trial", status="trial", seats=50,
                        starts_on=date.today(), ends_on=date.today() + timedelta(days=30)))
    audit(db, "institution.registered", actor=admin, entity_type="institution", entity_id=inst.id, category="admin",
          request=request)
    db.commit()
    return {"id": str(inst.id), "status": "pending_approval",
            "message": "Registration received. A platform administrator will activate your institution."}


@router.get("/institutions")
def list_institutions(db: DB, paging: Paging, user: User = Depends(require_permission(P.INSTITUTIONS_MANAGE))):
    stmt = select(Institution).where(Institution.deleted_at.is_(None))
    if paging.q:
        stmt = stmt.where(Institution.name.ilike(f"%{paging.q}%"))
    page = paginate(db, stmt.order_by(Institution.name), paging, Institution, {"name", "created_at"})
    page["items"] = [_inst_out(db, i) for i in page["items"]]
    return page


@router.post("/institutions", status_code=201)
def create_institution(data: InstitutionIn, db: DB, user: User = Depends(require_permission(P.INSTITUTIONS_MANAGE))):
    if db.scalar(select(Institution.id).where(Institution.code == data.code.upper())):
        raise Conflict("Institution code already taken")
    inst = Institution(**{**data.model_dump(), "code": data.code.upper()})
    db.add(inst)
    db.flush()
    db.add(Subscription(institution_id=inst.id, plan_code="standard", seats=200, starts_on=date.today()))
    audit(db, "institution.created", actor=user, entity_type="institution", entity_id=inst.id, category="admin")
    db.commit()
    return _inst_out(db, inst)


@router.get("/institutions/me")
def my_institution(user: CurrentUser, db: DB):
    if user.institution_id is None:
        raise NotFound("You are not part of an institution")
    return _inst_out(db, _inst(db, user, user.institution_id))


@router.get("/institutions/{inst_id}")
def get_institution(inst_id: uuid.UUID, user: CurrentUser, db: DB):
    return _inst_out(db, _inst(db, user, inst_id))


@router.patch("/institutions/{inst_id}")
def update_institution(inst_id: uuid.UUID, data: InstitutionUpdate, request: Request, db: DB,
                       user: User = Depends(require_permission(P.INSTITUTION_MANAGE))):
    inst = _inst(db, user, inst_id, manage=True)
    changes = data.model_dump(exclude_unset=True)
    if "is_active" in changes and not is_global(user):
        raise Forbidden("Only platform administrators can activate or suspend institutions")
    for k, v in changes.items():
        setattr(inst, k, v)
    audit(db, "institution.updated", actor=user, entity_type="institution", entity_id=inst.id, category="admin",
          request=request, details={"fields": sorted(changes)})
    db.commit()
    return _inst_out(db, inst)


@router.get("/institutions/{inst_id}/campuses")
def campuses(inst_id: uuid.UUID, user: CurrentUser, db: DB):
    _inst(db, user, inst_id)
    return [{"id": str(c.id), "name": c.name, "address": c.address} for c in db.scalars(
        select(Campus).where(Campus.institution_id == inst_id, Campus.deleted_at.is_(None)).order_by(Campus.name))]


@router.post("/institutions/{inst_id}/campuses", status_code=201)
def add_campus(inst_id: uuid.UUID, data: CampusIn, db: DB, user: User = Depends(require_permission(P.INSTITUTION_MANAGE))):
    _inst(db, user, inst_id, manage=True)
    c = Campus(institution_id=inst_id, **data.model_dump())
    db.add(c)
    db.commit()
    return {"id": str(c.id), "name": c.name, "address": c.address}


@router.get("/institutions/{inst_id}/academic-years")
def years(inst_id: uuid.UUID, user: CurrentUser, db: DB):
    _inst(db, user, inst_id)
    return [{"id": str(y.id), "label": y.label, "starts_on": y.starts_on.isoformat(), "ends_on": y.ends_on.isoformat(),
             "is_current": y.is_current} for y in db.scalars(select(AcademicYear).where(AcademicYear.institution_id == inst_id)
                                                              .order_by(AcademicYear.starts_on.desc()))]


@router.post("/institutions/{inst_id}/academic-years", status_code=201)
def add_year(inst_id: uuid.UUID, data: YearIn, db: DB, user: User = Depends(require_permission(P.INSTITUTION_MANAGE))):
    _inst(db, user, inst_id, manage=True)
    if data.ends_on <= data.starts_on:
        raise ValidationFailed("ends_on must be after starts_on")
    if data.is_current:
        for y in db.scalars(select(AcademicYear).where(AcademicYear.institution_id == inst_id)):
            y.is_current = False
    y = AcademicYear(institution_id=inst_id, **data.model_dump())
    db.add(y)
    db.commit()
    return {"id": str(y.id), "label": y.label, "is_current": y.is_current}


@router.get("/institutions/{inst_id}/classes")
def classes(inst_id: uuid.UUID, user: CurrentUser, db: DB):
    _inst(db, user, inst_id)
    counts = dict(db.execute(select(Enrollment.class_id, func.count()).where(Enrollment.status == "active")
                             .group_by(Enrollment.class_id)).all())
    return [{"id": str(c.id), "name": c.name, "grade": c.grade, "section": c.section,
             "campus_id": str(c.campus_id) if c.campus_id else None, "students": counts.get(c.id, 0)}
            for c in db.scalars(select(SchoolClass).where(SchoolClass.institution_id == inst_id,
                                                          SchoolClass.deleted_at.is_(None)).order_by(SchoolClass.grade, SchoolClass.name))]


@router.post("/institutions/{inst_id}/classes", status_code=201)
def add_class(inst_id: uuid.UUID, data: ClassIn, db: DB, user: User = Depends(require_permission(P.INSTITUTION_MANAGE))):
    _inst(db, user, inst_id, manage=True)
    c = SchoolClass(institution_id=inst_id, **data.model_dump())
    db.add(c)
    db.commit()
    return {"id": str(c.id), "name": c.name, "grade": c.grade, "section": c.section, "students": 0}


@router.post("/institutions/{inst_id}/students/import")
async def import_students(inst_id: uuid.UUID, request: Request, db: DB, file: UploadFile = File(...),
                          class_id: uuid.UUID | None = None,
                          user: User = Depends(require_permission(P.INSTITUTION_USERS_MANAGE))):
    """CSV columns: full_name,email,date_of_birth(YYYY-MM-DD),grade[,phone]. Each row is validated
    independently; invalid rows are reported and skipped. Temporary passwords are returned once."""
    inst = _inst(db, user, inst_id, manage=True)
    raw = (await file.read(2 * 1024 * 1024 + 1))
    if len(raw) > 2 * 1024 * 1024:
        raise ValidationFailed("CSV must be under 2 MB")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ValidationFailed("CSV must be UTF-8 encoded")
    reader = csv.DictReader(io.StringIO(text))
    required = {"full_name", "email", "date_of_birth"}
    if not reader.fieldnames or not required <= {f.strip() for f in reader.fieldnames}:
        raise ValidationFailed(f"CSV must have columns: {', '.join(sorted(required))}")
    if class_id:
        cls = db.get(SchoolClass, class_id)
        if cls is None or cls.institution_id != inst.id:
            raise NotFound("Class not found")
    from ...schemas.auth import StudentRegister
    created, errors = [], []
    for n, row in enumerate(reader, start=2):
        if n > 1001:
            errors.append({"row": n, "error": "Import is limited to 1000 rows"})
            break
        temp_pw = "Pf-" + secrets.token_urlsafe(8) + "1a"
        try:
            data = StudentRegister(full_name=row.get("full_name", "").strip(), email=row.get("email", "").strip() or None,
                                   phone=(row.get("phone") or "").strip() or None, password=temp_pw,
                                   date_of_birth=date.fromisoformat(row.get("date_of_birth", "").strip()),
                                   institution_code=inst.code)
            with db.begin_nested():
                if not inst.is_active:
                    raise ValidationFailed("Institution is not active yet")
                u = register_student(db, data, request)
                s = db.scalar(select(Student).where(Student.user_id == u.id))
                s.grade = (row.get("grade") or "").strip() or None
                s.school_name = inst.name
                if class_id:
                    db.add(Enrollment(student_id=s.id, class_id=class_id))
            created.append({"row": n, "full_name": data.full_name, "email": data.email, "temporary_password": temp_pw})
        except Exception as e:  # report per-row problems without aborting the batch
            msg = getattr(e, "message", None) or (e.errors()[0]["msg"] if hasattr(e, "errors") else str(e))
            errors.append({"row": n, "error": str(msg)[:200]})
    audit(db, "institution.students_imported", actor=user, entity_type="institution", entity_id=inst.id,
          category="admin", request=request, details={"created": len(created), "errors": len(errors)})
    db.commit()
    return {"created": created, "errors": errors,
            "note": "Share temporary passwords securely; students should change them at first sign-in."}


@router.get("/institutions/{inst_id}/staff")
def staff(inst_id: uuid.UUID, user: CurrentUser, db: DB):
    _inst(db, user, inst_id)
    rows = db.scalars(select(Mentor).where(Mentor.institution_id == inst_id, Mentor.deleted_at.is_(None))).all()
    batch_counts = dict(db.execute(select(Batch.mentor_id, func.count(BatchMember.id)).join(
        BatchMember, BatchMember.batch_id == Batch.id).group_by(Batch.mentor_id)).all())
    return [{"mentor_id": str(m.id), "user_id": str(m.user_id), "full_name": m.user.full_name, "email": m.user.email,
             "role": m.user.role, "kind": m.kind, "students": batch_counts.get(m.id, 0),
             "is_active": m.user.is_active} for m in rows]


@router.post("/institutions/{inst_id}/staff", status_code=201)
def add_staff(inst_id: uuid.UUID, data: StaffIn, request: Request, db: DB,
              user: User = Depends(require_permission(P.INSTITUTION_USERS_MANAGE))):
    _inst(db, user, inst_id, manage=True)
    u = create_user(db, full_name=data.full_name, email=data.email, phone=None, password=data.password, role=data.role,
                    institution_id=inst_id)
    u.is_verified = True
    m = Mentor(user_id=u.id, kind="teacher" if data.role == "teacher" else "mentor", institution_id=inst_id,
               expertise_domain_ids=[str(d) for d in data.expertise_domain_ids])
    db.add(m)
    audit(db, "institution.staff_added", actor=user, entity_type="user", entity_id=u.id, category="admin", request=request)
    db.commit()
    return {"mentor_id": str(m.id), "user_id": str(u.id), "full_name": u.full_name, "role": u.role}


@router.post("/institutions/{inst_id}/mentor-allocations", status_code=201)
def allocate(inst_id: uuid.UUID, data: AllocationIn, db: DB, user: User = Depends(require_permission(P.INSTITUTION_USERS_MANAGE))):
    _inst(db, user, inst_id, manage=True)
    m = db.get(Mentor, data.mentor_id)
    if m is None or m.institution_id != inst_id:
        raise NotFound("Mentor not found in this institution")
    students = db.scalars(select(Student).where(Student.id.in_(data.student_ids), Student.institution_id == inst_id)).all()
    if len(students) != len(set(data.student_ids)):
        raise ValidationFailed("All students must belong to this institution")
    b = Batch(mentor_id=m.id, name=data.batch_name, institution_id=inst_id)
    db.add(b)
    db.flush()
    for s in students:
        db.add(BatchMember(batch_id=b.id, student_id=s.id))
    db.commit()
    return {"batch_id": str(b.id), "mentor_id": str(m.id), "students": len(students)}


@router.post("/institutions/{inst_id}/activity-distribution")
def distribute(inst_id: uuid.UUID, data: DistributeIn, db: DB, user: User = Depends(require_permission(P.ACTIVITIES_ASSIGN))):
    _inst(db, user, inst_id)
    cls = db.get(SchoolClass, data.class_id)
    if cls is None or cls.institution_id != inst_id:
        raise NotFound("Class not found")
    a = db.get(Activity, data.activity_id)
    if a is None or a.deleted_at is not None or (a.institution_id not in (None, inst_id)):
        raise NotFound("Activity not found")
    ids = list(db.scalars(select(Enrollment.student_id).where(Enrollment.class_id == cls.id, Enrollment.status == "active")))
    if not ids:
        raise ValidationFailed("This class has no enrolled students")
    from datetime import datetime
    due = datetime.fromisoformat(data.due_at) if data.due_at else None
    rows = act_svc.assign(db, a, ids, assigned_by=user, batch_id=None, due_at=due, note=f"Class {cls.name}")
    db.commit()
    return {"assigned": len(rows)}


@router.get("/institutions/{inst_id}/analytics")
def institution_analytics(inst_id: uuid.UUID, db: DB, user: User = Depends(require_permission(P.INSTITUTION_ANALYTICS))):
    _inst(db, user, inst_id)
    student_ids = list(db.scalars(select(Student.id).where(Student.institution_id == inst_id, Student.deleted_at.is_(None))))
    domains = db.scalars(select(Domain).where(Domain.deleted_at.is_(None)).order_by(Domain.sort_order)).all()
    interest = dict(db.execute(select(StudentInterest.domain_id, func.count(func.distinct(StudentInterest.student_id)))
                               .where(StudentInterest.student_id.in_(student_ids or [uuid.uuid4()]),
                                      StudentInterest.is_active.is_(True)).group_by(StudentInterest.domain_id)).all())
    active = dict(db.execute(select(ProgressEvent.domain_id, func.count(func.distinct(ProgressEvent.student_id)))
                             .where(ProgressEvent.student_id.in_(student_ids or [uuid.uuid4()]))
                             .group_by(ProgressEvent.domain_id)).all())
    # Aggregate (never per-student ranking): average of latest skill score per domain among assessed students.
    per_domain: dict[uuid.UUID, list[float]] = {}
    for sid in student_ids:
        for sc in latest_scores(db, sid):
            if sc.skill_score is not None and sc.sufficiently_assessed:
                per_domain.setdefault(sc.domain_id, []).append(sc.skill_score)
    since = utcnow() - timedelta(days=30)
    return {
        "students": len(student_ids),
        "active_students_30d": db.scalar(select(func.count(func.distinct(ProgressEvent.student_id))).where(
            ProgressEvent.student_id.in_(student_ids or [uuid.uuid4()]), ProgressEvent.occurred_at >= since)) or 0,
        "domain_participation": [{
            "domain_id": str(d.id), "domain": d.name, "color": d.color,
            "interested_students": interest.get(d.id, 0), "participating_students": active.get(d.id, 0),
            "assessed_students": len(per_domain.get(d.id, [])),
            "average_skill_score": round(sum(per_domain[d.id]) / len(per_domain[d.id]), 1) if per_domain.get(d.id) else None,
        } for d in domains],
        "note": "Aggregated figures only. PathFinder never ranks individual students.",
    }


@router.get("/institutions/{inst_id}/subscription")
def get_subscription(inst_id: uuid.UUID, user: CurrentUser, db: DB):
    _inst(db, user, inst_id)
    sub = db.scalar(select(Subscription).where(Subscription.institution_id == inst_id).order_by(Subscription.created_at.desc()))
    plans = db.scalars(select(SubscriptionPlan).where(SubscriptionPlan.is_active.is_(True))).all()
    used = db.scalar(select(func.count()).select_from(Student).where(Student.institution_id == inst_id, Student.deleted_at.is_(None)))
    return {"subscription": None if sub is None else {"plan_code": sub.plan_code, "status": sub.status, "seats": sub.seats,
                                                      "starts_on": sub.starts_on.isoformat(),
                                                      "ends_on": sub.ends_on.isoformat() if sub.ends_on else None},
            "seats_used": used,
            "plans": [{"code": p.code, "name": p.name, "max_students": p.max_students,
                       "price_inr_per_year": p.price_inr_per_year, "features": p.features} for p in plans]}


@router.put("/institutions/{inst_id}/subscription")
def set_subscription(inst_id: uuid.UUID, data: SubscriptionIn, request: Request, db: DB,
                     user: User = Depends(require_permission(P.SUBSCRIPTIONS_MANAGE))):
    _inst(db, user, inst_id)
    if db.scalar(select(SubscriptionPlan.id).where(SubscriptionPlan.code == data.plan_code)) is None:
        raise NotFound("Plan not found")
    sub = Subscription(institution_id=inst_id, plan_code=data.plan_code, seats=data.seats, status=data.status,
                       starts_on=date.today(), ends_on=data.ends_on)
    db.add(sub)
    audit(db, "subscription.changed", actor=user, entity_type="institution", entity_id=inst_id, category="admin",
          request=request, details=data.model_dump(mode="json"))
    db.commit()
    return {"plan_code": sub.plan_code, "status": sub.status, "seats": sub.seats}


# ============================ reports ============================

@router.get("/reports", response_model=Page[ReportOut])
def list_reports(user: CurrentUser, db: DB, paging: Paging, student_id: uuid.UUID | None = None,
                 institution_id: uuid.UUID | None = None):
    if institution_id:
        _inst(db, user, institution_id)
        if not (is_global(user) or user.role == Role.INSTITUTION_ADMIN):
            raise Forbidden("Institution reports are for administrators")
        stmt = select(Report).where(Report.institution_id == institution_id, Report.student_id.is_(None))
    else:
        s = resolve_student(db, user, student_id)
        stmt = select(Report).where(Report.student_id == s.id)
    return paginate(db, stmt.order_by(Report.created_at.desc()), paging, Report, set())


@router.get("/reports/{report_id}", response_model=ReportOut)
def get_report(report_id: uuid.UUID, user: CurrentUser, db: DB):
    r = db.get(Report, report_id)
    if r is None:
        raise NotFound("Report not found")
    if r.student_id:
        resolve_student(db, user, r.student_id)
    elif r.institution_id:
        _inst(db, user, r.institution_id)
    return r


@router.post("/reports/generate", response_model=ReportOut, status_code=201)
def generate_report(data: ReportGenerate, user: CurrentUser, db: DB):
    from ...ai import service as ai
    s = resolve_student(db, user, data.student_id)
    days = 7 if data.kind == "weekly" else 30
    if data.kind == "parent":
        result = ai.parent_report(db, user, s, days=30)
        content = {**result["data"], "source": result["source"], "label": result["label"]}
        title = result["data"].get("title", "Progress report")
    else:
        from pathfinder_engine.report_generation import build_progress_summary
        from ...services.progress import progress_summary
        summ = build_progress_summary(ai.report_facts(db, s, days))
        prog = progress_summary(db, s)
        content = {"summary": summ, "progress": prog, "source": "engine", "label": ai.ENGINE_LABEL}
        result = {"source": "engine"}
        title = f"{s.user.first_name}'s {data.kind} report"
    r = Report(student_id=s.id, institution_id=s.institution_id, kind=data.kind,
               period_start=date.today() - timedelta(days=days), period_end=date.today(), title=title[:200],
               content=content, generated_by=result["source"], created_by=user.id)
    db.add(r)
    db.commit()
    return r


@router.post("/reports/institution/{inst_id}", response_model=ReportOut, status_code=201)
def institution_report(inst_id: uuid.UUID, db: DB, user: User = Depends(require_permission(P.INSTITUTION_ANALYTICS))):
    inst = _inst(db, user, inst_id)
    content = institution_analytics(inst_id, db, user)
    r = Report(institution_id=inst.id, kind="institution", period_start=date.today() - timedelta(days=30),
               period_end=date.today(), title=f"{inst.name} - domain participation report", content=content,
               generated_by="engine", created_by=user.id)
    db.add(r)
    db.commit()
    return r


_ = (re, DomainScore)  # noqa
