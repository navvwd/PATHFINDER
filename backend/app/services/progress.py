"""Progress analytics built on the append-only progress_events stream."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from pathfinder_engine import EvidenceRecord
from pathfinder_engine.analytics import bucket_scores, summarize_progress
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import ActivityAssignment, Domain, ProgressEvent, ProgressSnapshot, Student
from .scoring import evidence_for_student, latest_scores


def _all_records(by_domain: dict[uuid.UUID, list[EvidenceRecord]]) -> list[EvidenceRecord]:
    return [r for recs in by_domain.values() for r in recs]


def progress_summary(db: Session, student: Student) -> dict:
    evidence = evidence_for_student(db, student.id)
    assigned = db.scalar(select(func.count()).select_from(ActivityAssignment).where(
        ActivityAssignment.student_id == student.id, ActivityAssignment.is_voluntary.is_(False))) or 0
    completed = db.scalar(select(func.count()).select_from(ActivityAssignment).where(
        ActivityAssignment.student_id == student.id, ActivityAssignment.is_voluntary.is_(False),
        ActivityAssignment.status.in_(("submitted", "completed")))) or 0
    overall = summarize_progress(_all_records(evidence), assigned=assigned, completed=completed)
    domains = {d.id: d for d in db.scalars(select(Domain).where(Domain.deleted_at.is_(None)).order_by(Domain.sort_order)).all()}
    scores = {s.domain_id: s for s in latest_scores(db, student.id)}
    per_domain = []
    for d in domains.values():
        recs = evidence.get(d.id, [])
        summ = summarize_progress(recs)
        sc = scores.get(d.id)
        per_domain.append({
            "domain_id": str(d.id), "domain_name": d.name, "color": d.color, **summ.to_dict(),
            "skill_score": sc.skill_score if sc else None, "progress_score": sc.progress_score if sc else None,
            "interest_score": sc.interest_score if sc else None, "confidence": sc.confidence if sc else 0,
            "confidence_label": sc.confidence_label if sc else "none",
            "status": "unexplored" if not recs else ("emerging" if not (sc and sc.sufficiently_assessed) else "assessed"),
        })
    return {"overall": overall.to_dict(), "domains": per_domain,
            "notes": ["Improvement compares only repeated attempts of the same activity or assessment.",
                      "Unexplored domains are opportunities, not weaknesses."]}


def timeline(db: Session, student: Student, period: str, domain_id: uuid.UUID | None = None, days: int = 180) -> list[dict]:
    evidence = evidence_for_student(db, student.id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    recs = evidence.get(domain_id, []) if domain_id else _all_records(evidence)
    recs = [r for r in recs if r.occurred_at >= since]
    buckets = bucket_scores(recs, period)  # type: ignore[arg-type]
    # activity counts per bucket (all events, including unscored ones)
    events = db.scalars(select(ProgressEvent).where(ProgressEvent.student_id == student.id,
                                                    ProgressEvent.occurred_at >= since,
                                                    ProgressEvent.event_type.in_(("activity_submitted", "project_submitted",
                                                                                  "assessment_completed", "reflection")))).all()
    counts: dict[str, int] = {}
    for e in events:
        d = e.occurred_at.date()
        key = d if period == "daily" else (d - timedelta(days=d.weekday()) if period == "weekly" else d.replace(day=1))
        counts[key.isoformat()] = counts.get(key.isoformat(), 0) + 1
    by_key = {b["period_start"]: b for b in buckets}
    for k, c in counts.items():
        by_key.setdefault(k, {"period_start": k, "count": 0, "average_score": None})
        by_key[k]["actions"] = c
    for b in by_key.values():
        b.setdefault("actions", 0)
    return sorted(by_key.values(), key=lambda b: b["period_start"])


def snapshot(db: Session, student: Student, period: str = "weekly", today: date | None = None) -> ProgressSnapshot:
    """Persist a period snapshot (idempotent per period)."""
    today = today or date.today()
    start = today - timedelta(days=today.weekday()) if period == "weekly" else (
        today.replace(day=1) if period == "monthly" else today)
    summary = progress_summary(db, student)
    row = db.scalar(select(ProgressSnapshot).where(ProgressSnapshot.student_id == student.id,
                                                   ProgressSnapshot.period == period,
                                                   ProgressSnapshot.period_start == start))
    metrics = {"overall": summary["overall"], "xp": student.xp, "streak": student.current_streak,
               "domains": [{k: d[k] for k in ("domain_id", "skill_score", "progress_score", "confidence")}
                           for d in summary["domains"]]}
    if row is None:
        row = ProgressSnapshot(student_id=student.id, period=period, period_start=start, metrics=metrics)
        db.add(row)
    else:
        row.metrics = metrics
    return row
