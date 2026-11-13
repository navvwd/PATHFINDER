"""Bridge between the database and the pure ``pathfinder_engine``.

* builds engine inputs (evidence + interest signals) from ORM rows
* runs scoring and stores a *new* DomainScore row per domain (history kept)
* manages versioned scoring configuration
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone

from pathfinder_engine import DomainEvidence, DomainScoreResult, EvidenceRecord, InterestSignal
from pathfinder_engine.scoring import DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS, ScoringConfig, score_domain, validate_weights
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.errors import ValidationFailed
from ..models import (
    ActivityAssignment,
    Domain,
    DomainScore,
    InterestHistory,
    ProgressEvent,
    ScoringConfigVersion,
    Student,
    StudentInterest,
    User,
)

EVIDENCE_EVENTS = ("activity_completed", "assessment_completed", "project_submitted", "mentor_observation")


def active_config(db: Session) -> ScoringConfig:
    row = db.scalar(select(ScoringConfigVersion).where(ScoringConfigVersion.is_active.is_(True))
                    .order_by(ScoringConfigVersion.version.desc()))
    if row is None:
        return ScoringConfig()
    return ScoringConfig(weights=dict(row.weights), thresholds={**DEFAULT_THRESHOLDS, **(row.thresholds or {})},
                         version=row.version)


def create_config_version(db: Session, weights: dict, thresholds: dict, note: str | None, actor: User) -> ScoringConfigVersion:
    try:
        weights = validate_weights(weights)
    except ValueError as e:
        raise ValidationFailed(str(e))
    unknown = set(thresholds) - set(DEFAULT_THRESHOLDS)
    if unknown:
        raise ValidationFailed(f"Unknown thresholds: {sorted(unknown)}")
    latest = db.scalar(select(func.max(ScoringConfigVersion.version))) or 0
    for row in db.scalars(select(ScoringConfigVersion).where(ScoringConfigVersion.is_active.is_(True))).all():
        row.is_active = False
    row = ScoringConfigVersion(version=latest + 1, weights=weights, thresholds=thresholds, is_active=True,
                               note=note, created_by=actor.id)
    db.add(row)
    return row


def ensure_default_config(db: Session) -> None:
    if db.scalar(select(func.count()).select_from(ScoringConfigVersion)) == 0:
        db.add(ScoringConfigVersion(version=1, weights=dict(DEFAULT_WEIGHTS), thresholds={}, is_active=True,
                                    note="Default specification weights"))


def evidence_for_student(db: Session, student_id: uuid.UUID) -> dict[uuid.UUID, list[EvidenceRecord]]:
    rows = db.scalars(select(ProgressEvent).where(
        ProgressEvent.student_id == student_id,
        ProgressEvent.event_type.in_(EVIDENCE_EVENTS),
        ProgressEvent.score_pct.is_not(None),
        ProgressEvent.is_superseded.is_(False),
        ProgressEvent.domain_id.is_not(None),
    ).order_by(ProgressEvent.occurred_at)).all()
    out: dict[uuid.UUID, list[EvidenceRecord]] = defaultdict(list)
    for e in rows:
        out[e.domain_id].append(EvidenceRecord(
            domain_id=str(e.domain_id),
            kind=e.evidence_kind or "activity",  # type: ignore[arg-type]
            score_pct=float(e.score_pct),
            occurred_at=e.occurred_at,
            scale_key=e.scale_key or f"{e.source_type}:{e.source_id}",
            category=e.category or "general",
            subdomain_id=str(e.subdomain_id) if e.subdomain_id else None,
            difficulty=e.difficulty or 1,
            attempt_no=e.attempt_no or 1,
            mentor_validated=e.mentor_validated,
            evidence_quality=e.evidence_quality if e.evidence_quality is not None else 0.5,
            dimension_scores={k: float(v) for k, v in (e.dimension_scores or {}).items()},
        ))
    return out


def interest_signals(db: Session, student_id: uuid.UUID) -> dict[uuid.UUID, InterestSignal]:
    interests = db.scalars(select(StudentInterest).where(
        StudentInterest.student_id == student_id, StudentInterest.is_active.is_(True))).all()
    explored = dict(db.execute(
        select(InterestHistory.domain_id, func.count()).where(
            InterestHistory.student_id == student_id, InterestHistory.action == "explored")
        .group_by(InterestHistory.domain_id)).all())
    by_domain: dict[uuid.UUID, dict] = {}
    for i in interests:
        d = by_domain.setdefault(i.domain_id, {"selected": False, "strength": 1, "fav": False, "subs": 0})
        if i.subdomain_id is None:
            d["selected"] = True
            d["strength"] = max(d["strength"], i.strength)
            d["fav"] = d["fav"] or i.is_favourite
        else:
            d["subs"] += 1
            d["selected"] = True
            d["strength"] = max(d["strength"], i.strength)
    out: dict[uuid.UUID, InterestSignal] = {}
    for dom_id in set(by_domain) | {k for k in explored if k}:
        d = by_domain.get(dom_id, {"selected": False, "strength": 1, "fav": False, "subs": 0})
        out[dom_id] = InterestSignal(domain_id=str(dom_id), selected=d["selected"], strength=d["strength"],
                                     is_favourite=d["fav"], voluntary_explorations=int(explored.get(dom_id, 0)),
                                     subdomain_count=d["subs"])
    return out


def _assignment_counts(db: Session, student_id: uuid.UUID) -> dict[uuid.UUID, tuple[int, int, int]]:
    rows = db.execute(
        select(ActivityAssignment.status, ActivityAssignment.is_voluntary, ActivityAssignment.activity_id)
        .where(ActivityAssignment.student_id == student_id)
    ).all()
    from ..models import Activity  # local import avoids cycle at module import time

    act_domain = dict(db.execute(select(Activity.id, Activity.domain_id).where(
        Activity.id.in_({r.activity_id for r in rows}))).all()) if rows else {}
    counts: dict[uuid.UUID, list[int]] = defaultdict(lambda: [0, 0, 0])
    for status, voluntary, activity_id in rows:
        dom = act_domain.get(activity_id)
        if dom is None:
            continue
        c = counts[dom]
        if not voluntary:
            c[0] += 1
        if status in ("submitted", "completed"):
            c[1] += 1
            if voluntary:
                c[2] += 1
    return {k: (v[0], v[1], v[2]) for k, v in counts.items()}


def compute_scores(db: Session, student: Student, persist: bool = True) -> list[tuple[Domain, DomainScoreResult]]:
    config = active_config(db)
    domains = db.scalars(select(Domain).where(Domain.deleted_at.is_(None), Domain.is_active.is_(True))
                         .order_by(Domain.sort_order)).all()
    evidence = evidence_for_student(db, student.id)
    interests = interest_signals(db, student.id)
    counts = _assignment_counts(db, student.id)
    now = datetime.now(timezone.utc)
    results: list[tuple[Domain, DomainScoreResult]] = []
    for d in domains:
        assigned, completed, voluntary = counts.get(d.id, (0, 0, 0))
        ev = DomainEvidence(domain_id=str(d.id), records=evidence.get(d.id, []), assigned_count=assigned,
                            completed_count=completed, voluntary_count=voluntary)
        res = score_domain(ev, interests.get(d.id), config, now)
        results.append((d, res))
        if persist:
            db.add(DomainScore(
                student_id=student.id, domain_id=d.id, interest_score=res.interest_score, skill_score=res.skill_score,
                progress_score=res.progress_score, confidence=res.confidence, confidence_label=res.confidence_label,
                evidence_count=res.evidence_count, sufficiently_assessed=res.sufficiently_assessed,
                validated_advanced=res.validated_advanced,
                dimensions=[dim.__dict__ for dim in res.dimensions], explanation=res.explanation,
                confidence_breakdown=res.confidence_breakdown, scoring_config_version=config.version, computed_at=now,
            ))
    return results


def latest_scores(db: Session, student_id: uuid.UUID) -> list[DomainScore]:
    sub = (select(DomainScore.domain_id, func.max(DomainScore.computed_at).label("mx"))
           .where(DomainScore.student_id == student_id).group_by(DomainScore.domain_id).subquery())
    return list(db.scalars(select(DomainScore).join(
        sub, (DomainScore.domain_id == sub.c.domain_id) & (DomainScore.computed_at == sub.c.mx)
    ).where(DomainScore.student_id == student_id)).all())
