from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from ...core.deps import DB, CurrentUser, require_permission
from ...core.errors import Conflict, NotFound
from ...core.permissions import P, Role
from ...core.security import utcnow
from ...models import Activity, Assessment, Domain, LearningResource, Subdomain, User
from ...schemas.common import Message
from ...schemas.learning import (
    ActivityOut,
    DomainDetail,
    DomainIn,
    DomainOut,
    DomainUpdate,
    ResourceIn,
    ResourceOut,
    SubdomainIn,
    SubdomainOut,
    SubdomainUpdate,
)
from ...services.access import student_for_user
from ...services.activities import activity_out
from ...services.audit import audit
from ...services.interests import record_exploration

router = APIRouter(tags=["domains"])
manage = require_permission(P.DOMAINS_MANAGE)


def _domain(db, ref: str) -> Domain:
    stmt = select(Domain).options(selectinload(Domain.subdomains)).where(Domain.deleted_at.is_(None))
    try:
        d = db.scalar(stmt.where(Domain.id == uuid.UUID(ref)))
    except ValueError:
        d = db.scalar(stmt.where(Domain.slug == ref))
    if d is None:
        raise NotFound("Domain not found")
    return d


def _domain_out(d: Domain, cls=DomainOut):
    data = cls.model_validate(d, from_attributes=True).model_dump()
    data["subdomains"] = [SubdomainOut.model_validate(s) for s in d.subdomains if s.deleted_at is None and s.is_active]
    return cls(**data)


@router.get("/domains", response_model=list[DomainOut])
def list_domains(db: DB, include_inactive: bool = False):
    stmt = select(Domain).options(selectinload(Domain.subdomains)).where(Domain.deleted_at.is_(None))
    if not include_inactive:
        stmt = stmt.where(Domain.is_active.is_(True))
    return [_domain_out(d) for d in db.scalars(stmt.order_by(Domain.sort_order)).all()]


@router.get("/domains/{ref}", response_model=DomainDetail)
def domain_detail(ref: str, user: CurrentUser, db: DB):
    d = _domain(db, ref)
    if user.role == Role.STUDENT:
        record_exploration(db, student_for_user(db, user), d.id, None)
        db.commit()
    out = _domain_out(d, DomainDetail)
    out.resources = [ResourceOut.model_validate(r) for r in db.scalars(
        select(LearningResource).where(LearningResource.domain_id == d.id, LearningResource.deleted_at.is_(None))).all()]
    counts = dict(db.execute(select(Activity.category, func.count()).where(
        Activity.domain_id == d.id, Activity.status == "published", Activity.deleted_at.is_(None))
        .group_by(Activity.category)).all())
    out.activity_counts = counts
    out.project_count = counts.get("practical_project", 0) + counts.get("research_task", 0)
    out.challenge_count = sum(v for k, v in counts.items() if k in ("coding_challenge", "logical_puzzle", "team_challenge",
                                                                      "business_simulation", "science_experiment"))
    out.assessment_count = db.scalar(select(func.count()).select_from(Assessment).where(
        Assessment.domain_id == d.id, Assessment.status == "published", Assessment.deleted_at.is_(None))) or 0
    return out


@router.post("/domains", response_model=DomainOut, status_code=201)
def create_domain(data: DomainIn, request: Request, db: DB, user: User = Depends(manage)):
    if db.scalar(select(Domain.id).where(Domain.slug == data.slug)):
        raise Conflict("A domain with this slug already exists")
    d = Domain(**data.model_dump())
    db.add(d)
    audit(db, "domain.created", actor=user, entity_type="domain", entity_id=d.id, category="admin", request=request)
    db.commit()
    return _domain_out(_domain(db, str(d.id)))


@router.patch("/domains/{domain_id}", response_model=DomainOut)
def update_domain(domain_id: uuid.UUID, data: DomainUpdate, request: Request, db: DB, user: User = Depends(manage)):
    d = _domain(db, str(domain_id))
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    audit(db, "domain.updated", actor=user, entity_type="domain", entity_id=d.id, category="admin", request=request,
          details={"fields": sorted(data.model_dump(exclude_unset=True))})
    db.commit()
    return _domain_out(d)


@router.delete("/domains/{domain_id}", response_model=Message)
def delete_domain(domain_id: uuid.UUID, request: Request, db: DB, user: User = Depends(manage)):
    d = _domain(db, str(domain_id))
    d.deleted_at = utcnow()  # soft delete keeps historical records intact
    d.is_active = False
    audit(db, "domain.deleted", actor=user, entity_type="domain", entity_id=d.id, category="admin", request=request)
    db.commit()
    return Message(message="Domain archived")


# ---------------- subdomains ----------------

@router.get("/subdomains", response_model=list[SubdomainOut])
def list_subdomains(db: DB, domain_id: uuid.UUID | None = None):
    stmt = select(Subdomain).where(Subdomain.deleted_at.is_(None), Subdomain.is_active.is_(True))
    if domain_id:
        stmt = stmt.where(Subdomain.domain_id == domain_id)
    return db.scalars(stmt.order_by(Subdomain.sort_order)).all()


@router.get("/subdomains/{subdomain_id}")
def subdomain_detail(subdomain_id: uuid.UUID, user: CurrentUser, db: DB):
    sub = db.get(Subdomain, subdomain_id)
    if sub is None or sub.deleted_at is not None:
        raise NotFound("Subdomain not found")
    if user.role == Role.STUDENT:
        record_exploration(db, student_for_user(db, user), sub.domain_id, sub.id)
        db.commit()
    acts = db.scalars(select(Activity).where(Activity.subdomain_id == sub.id, Activity.status == "published",
                                             Activity.deleted_at.is_(None)).order_by(Activity.difficulty)).all()
    res = db.scalars(select(LearningResource).where(LearningResource.subdomain_id == sub.id,
                                                    LearningResource.deleted_at.is_(None))).all()
    return {
        "subdomain": SubdomainOut.model_validate(sub),
        "domain": {"id": str(sub.domain.id), "name": sub.domain.name, "slug": sub.domain.slug, "color": sub.domain.color},
        "activities": [activity_out(a) for a in acts],
        "resources": [ResourceOut.model_validate(r) for r in res],
    }


@router.post("/subdomains", response_model=SubdomainOut, status_code=201)
def create_subdomain(data: SubdomainIn, db: DB, user: User = Depends(manage)):
    _domain(db, str(data.domain_id))
    if db.scalar(select(Subdomain.id).where(Subdomain.domain_id == data.domain_id, Subdomain.slug == data.slug)):
        raise Conflict("Subdomain slug already exists in this domain")
    sub = Subdomain(**data.model_dump())
    db.add(sub)
    audit(db, "subdomain.created", actor=user, entity_type="subdomain", entity_id=sub.id, category="admin")
    db.commit()
    return sub


@router.patch("/subdomains/{subdomain_id}", response_model=SubdomainOut)
def update_subdomain(subdomain_id: uuid.UUID, data: SubdomainUpdate, db: DB, user: User = Depends(manage)):
    sub = db.get(Subdomain, subdomain_id)
    if sub is None or sub.deleted_at is not None:
        raise NotFound("Subdomain not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(sub, k, v)
    audit(db, "subdomain.updated", actor=user, entity_type="subdomain", entity_id=sub.id, category="admin")
    db.commit()
    return sub


@router.delete("/subdomains/{subdomain_id}", response_model=Message)
def delete_subdomain(subdomain_id: uuid.UUID, db: DB, user: User = Depends(manage)):
    sub = db.get(Subdomain, subdomain_id)
    if sub is None or sub.deleted_at is not None:
        raise NotFound("Subdomain not found")
    sub.deleted_at = utcnow()
    audit(db, "subdomain.deleted", actor=user, entity_type="subdomain", entity_id=sub.id, category="admin")
    db.commit()
    return Message(message="Subdomain archived")


@router.post("/domains/resources", response_model=ResourceOut, status_code=201)
def create_resource(data: ResourceIn, db: DB, user: User = Depends(require_permission(P.CONTENT_MANAGE))):
    r = LearningResource(**{**data.model_dump(), "url": str(data.url) if data.url else None})
    db.add(r)
    db.commit()
    return r


_ = ActivityOut  # re-exported type used in subdomain_detail payloads
