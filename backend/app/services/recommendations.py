"""Runs the explainable recommendation engine against real student records
and persists each run. Recommendations are never hard-coded."""

from __future__ import annotations

import uuid

from pathfinder_engine import InterestSignal
from pathfinder_engine.recommendation import ActivityCandidate, DomainInfo, generate_recommendations
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Activity, Domain, Recommendation, Student, Submission
from .auth import age_on
from .notify import notify
from .scoring import compute_scores, interest_signals

DISCLAIMER = ("These suggestions are based on recorded activities and the interests you chose. They are not a test "
              "of intelligence or a diagnosis, and you are free to disagree.")


def generate(db: Session, student: Student) -> dict:
    scored = compute_scores(db, student)
    domains = [DomainInfo(id=str(d.id), name=d.name) for d, _ in scored]
    results = [r for _, r in scored]
    signals = interest_signals(db, student.id)
    interests = [signals.get(d.id) or InterestSignal(domain_id=str(d.id), selected=False) for d, _ in scored]
    age = age_on(student.date_of_birth)
    acts = db.scalars(select(Activity).where(
        Activity.status == "published", Activity.deleted_at.is_(None),
        (Activity.institution_id.is_(None)) | (Activity.institution_id == student.institution_id))).all()
    candidates = [ActivityCandidate(id=str(a.id), title=a.title, domain_id=str(a.domain_id), difficulty=a.difficulty,
                                    category=a.category, subdomain_id=str(a.subdomain_id) if a.subdomain_id else None,
                                    age_eligible=a.min_age <= age <= a.max_age) for a in acts]
    completed = {str(x) for x in db.scalars(select(Submission.activity_id).where(Submission.student_id == student.id)).all()}
    result = generate_recommendations(domains, interests, results, candidates, completed)

    # Supersede previous active items; responded items stay as history.
    for old in db.scalars(select(Recommendation).where(Recommendation.student_id == student.id,
                                                       Recommendation.status == "active")).all():
        old.status = "superseded"
    disagreed = {r.domain_id for r in db.scalars(select(Recommendation).where(
        Recommendation.student_id == student.id, Recommendation.status == "disagreed")).all()}
    run_id = uuid.uuid4()
    for item in result.items:
        dom = uuid.UUID(item.domain_id) if item.domain_id else None
        reasons = list(item.reasons)
        if dom in disagreed and item.kind in ("promising_domain", "focus_domain", "alignment"):
            reasons.append("You disagreed with an earlier suggestion here. Your view is respected and shared with your mentor.")
        db.add(Recommendation(student_id=student.id, run_id=run_id, kind=item.kind, domain_id=dom,
                              activity_id=uuid.UUID(item.activity_id) if item.activity_id else None,
                              title=item.title[:250], reasons=reasons, evidence=item.evidence,
                              confidence=item.confidence, priority=item.priority, generated_by="engine"))
    db.flush()
    if result.status == "ok":
        notify(db, student.user_id, "recommendations", "New personalised suggestions are ready", result.message,
               "/app/recommendations")
    return {"run_id": run_id, "status": result.status, "message": result.message}


def latest_set(db: Session, student: Student) -> dict:
    latest = db.scalar(select(Recommendation).where(Recommendation.student_id == student.id)
                       .order_by(Recommendation.created_at.desc()))
    if latest is None:
        return {"status": "not_generated", "message": "No recommendations yet.", "disclaimer": DISCLAIMER,
                "promising_domains": [], "focus_domains": [], "generated_at": None, "items": []}
    items = db.scalars(select(Recommendation).where(Recommendation.run_id == latest.run_id)
                       .order_by(Recommendation.priority, Recommendation.created_at)).all()
    promising = [i.domain_id for i in items if i.kind in ("promising_domain", "focus_domain")]
    focus = [i.domain_id for i in items if i.kind == "focus_domain"]
    status = "ok" if promising else "insufficient_data"
    msg = ("Based on your recorded activities and assessments." if status == "ok" else
           "Not enough evidence yet to identify promising domains. Keep exploring with the suggestions below.")
    return {"status": status, "message": msg, "disclaimer": DISCLAIMER, "promising_domains": promising,
            "focus_domains": focus, "generated_at": latest.created_at, "items": decorate(db, list(items))}


def decorate(db: Session, items: list[Recommendation]) -> list:
    from ..schemas.growth import RecommendationOut

    names = dict(db.execute(select(Domain.id, Domain.name)).all())
    out = []
    for r in items:
        o = RecommendationOut.model_validate(r)
        o.domain_name = names.get(r.domain_id)
        out.append(o)
    return out
