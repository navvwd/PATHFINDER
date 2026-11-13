"""Interest discovery: selections, questionnaire, exploration, evolution tracking.

Interest = what the student *chooses*. Nothing here reads scores or performance.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.errors import ValidationFailed
from ..models import Domain, InterestHistory, ProgressEvent, Student, StudentInterest, Subdomain

QUESTIONNAIRE = {
    "version": "2026-01",
    "questions": [
        {"id": "q_free_time", "prompt": "On a free afternoon, what would you most like to do?", "multi": True, "options": [
            {"id": "build", "label": "Build or code something", "domains": ["stem"]},
            {"id": "draw", "label": "Draw, design or make a video", "domains": ["creative-arts"]},
            {"id": "sell", "label": "Plan a small business or sale", "domains": ["business"]},
            {"id": "talk", "label": "Lead a group or give a talk", "domains": ["communication"]},
            {"id": "experiment", "label": "Do an experiment or observe nature", "domains": ["science"]},
            {"id": "play", "label": "Play a sport or train", "domains": ["sports"]},
        ]},
        {"id": "q_problem", "prompt": "Which kind of problem sounds the most fun?", "multi": True, "options": [
            {"id": "puzzle", "label": "A tricky logic puzzle", "domains": ["stem"]},
            {"id": "story", "label": "Inventing a story or character", "domains": ["creative-arts"]},
            {"id": "money", "label": "Working out how to earn or save money", "domains": ["business"]},
            {"id": "debate", "label": "Convincing people in a debate", "domains": ["communication"]},
            {"id": "why", "label": "Finding out why something happens", "domains": ["science"]},
            {"id": "strategy", "label": "Planning a winning game strategy", "domains": ["sports"]},
        ]},
        {"id": "q_proud", "prompt": "What would make you feel proud?", "multi": True, "options": [
            {"id": "app", "label": "An app or robot I made", "domains": ["stem"]},
            {"id": "art", "label": "Artwork people love", "domains": ["creative-arts"]},
            {"id": "venture", "label": "A project that earns real money", "domains": ["business"]},
            {"id": "team", "label": "A team I led that succeeded", "domains": ["communication"]},
            {"id": "discovery", "label": "A discovery or research finding", "domains": ["science"]},
            {"id": "medal", "label": "Reaching a personal best in sport", "domains": ["sports"]},
        ]},
        {"id": "q_learn", "prompt": "How do you like to learn?", "multi": True, "options": [
            {"id": "hands_on", "label": "Hands-on making", "preference": "hands_on"},
            {"id": "videos", "label": "Watching videos", "preference": "visual"},
            {"id": "reading", "label": "Reading", "preference": "reading"},
            {"id": "group", "label": "With friends in a group", "preference": "collaborative"},
        ]},
    ],
}


def _history(db: Session, student_id: uuid.UUID, action: str, domain_id=None, subdomain_id=None, old=None, new=None,
             source="self") -> None:
    db.add(InterestHistory(student_id=student_id, domain_id=domain_id, subdomain_id=subdomain_id, action=action,
                           old_value=old, new_value=new, source=source))


def set_selections(db: Session, student: Student, selections: list, source: str = "self") -> list[StudentInterest]:
    """Replace the active set of interests, logging every change to interest_history."""
    domains = set(db.scalars(select(Domain.id).where(Domain.deleted_at.is_(None))).all())
    sub_parent = dict(db.execute(select(Subdomain.id, Subdomain.domain_id)).all())
    wanted: dict[tuple, dict] = {}
    for sel in selections:
        if sel.domain_id not in domains:
            raise ValidationFailed("Unknown domain in selection")
        if sel.subdomain_id is not None and sub_parent.get(sel.subdomain_id) != sel.domain_id:
            raise ValidationFailed("Subdomain does not belong to the selected domain")
        wanted[(sel.domain_id, sel.subdomain_id)] = {"strength": sel.strength, "is_favourite": sel.is_favourite}
        if sel.subdomain_id is not None:  # selecting a subdomain implies the domain
            wanted.setdefault((sel.domain_id, None), {"strength": sel.strength, "is_favourite": False})

    existing = {(i.domain_id, i.subdomain_id): i for i in
                db.scalars(select(StudentInterest).where(StudentInterest.student_id == student.id)).all()}

    for key, row in existing.items():
        if row.is_active and key not in wanted:
            row.is_active = False
            _history(db, student.id, "removed", key[0], key[1], old={"strength": row.strength}, source=source)

    for key, vals in wanted.items():
        row = existing.get(key)
        if row is None:
            db.add(StudentInterest(student_id=student.id, domain_id=key[0], subdomain_id=key[1], source=source, **vals))
            _history(db, student.id, "added", key[0], key[1], new=vals, source=source)
            continue
        if not row.is_active:
            row.is_active = True
            row.strength, row.is_favourite = vals["strength"], vals["is_favourite"]
            _history(db, student.id, "added", key[0], key[1], new=vals, source=source)
            continue
        if row.strength != vals["strength"]:
            _history(db, student.id, "strength_changed", key[0], key[1], old={"strength": row.strength},
                     new={"strength": vals["strength"]}, source=source)
            row.strength = vals["strength"]
        if row.is_favourite != vals["is_favourite"]:
            _history(db, student.id, "favourited" if vals["is_favourite"] else "unfavourited", key[0], key[1], source=source)
            row.is_favourite = vals["is_favourite"]
    db.flush()
    return active_interests(db, student.id)


def active_interests(db: Session, student_id: uuid.UUID) -> list[StudentInterest]:
    return list(db.scalars(select(StudentInterest).where(StudentInterest.student_id == student_id,
                                                         StudentInterest.is_active.is_(True))).all())


def record_exploration(db: Session, student: Student, domain_id: uuid.UUID, subdomain_id: uuid.UUID | None) -> None:
    """Voluntary exploration (opening a domain/subdomain page). Deduplicated per day."""
    from datetime import datetime, timezone

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    dup = db.scalar(select(InterestHistory.id).where(
        InterestHistory.student_id == student.id, InterestHistory.action == "explored",
        InterestHistory.domain_id == domain_id, InterestHistory.subdomain_id.is_(subdomain_id) if subdomain_id is None
        else InterestHistory.subdomain_id == subdomain_id, InterestHistory.created_at >= today_start))
    if dup:
        return
    first_ever = not db.scalar(select(InterestHistory.id).where(
        InterestHistory.student_id == student.id, InterestHistory.domain_id == domain_id,
        InterestHistory.action == "explored"))
    _history(db, student.id, "explored", domain_id, subdomain_id, new={"first_time": first_ever}, source="exploration")
    if first_ever:
        db.add(ProgressEvent(student_id=student.id, domain_id=domain_id, event_type="domain_explored",
                             source_type="domain", source_id=domain_id, payload={"subdomain_id": str(subdomain_id) if subdomain_id else None}))


def score_questionnaire(db: Session, student: Student, answers) -> dict:
    """Turns questionnaire answers into *suggested* interests. The student
    still confirms them - nothing is auto-selected without their choice."""
    slug_to_id = dict(db.execute(select(Domain.slug, Domain.id)).all())
    qmap = {q["id"]: q for q in QUESTIONNAIRE["questions"]}
    tally: dict[str, int] = {}
    prefs: list[str] = []
    for a in answers:
        q = qmap.get(a.question_id)
        if q is None:
            raise ValidationFailed(f"Unknown question {a.question_id}")
        opts = {o["id"]: o for o in q["options"]}
        for oid in a.option_ids:
            o = opts.get(oid)
            if o is None:
                raise ValidationFailed(f"Unknown option {oid}")
            for slug in o.get("domains", []):
                tally[slug] = tally.get(slug, 0) + 1
            if "preference" in o:
                prefs.append(o["preference"])
    suggestions = [
        {"domain_id": str(slug_to_id[s]), "slug": s, "votes": n, "suggested_strength": min(5, 2 + n)}
        for s, n in sorted(tally.items(), key=lambda kv: -kv[1]) if s in slug_to_id
    ]
    _history(db, student.id, "questionnaire", new={"suggestions": suggestions, "preferences": prefs,
                                                    "version": QUESTIONNAIRE["version"]}, source="questionnaire")
    if prefs:
        student.learning_preferences = sorted(set((student.learning_preferences or []) + prefs))
    return {"suggestions": suggestions, "learning_preferences": prefs,
            "note": "These are suggestions from your answers. You decide which interests to keep."}


def evolution(db: Session, student_id: uuid.UUID) -> dict:
    hist = db.scalars(select(InterestHistory).where(InterestHistory.student_id == student_id)
                      .order_by(InterestHistory.created_at)).all()
    initial = [h for h in hist if h.action == "added" and h.source == "onboarding" and h.subdomain_id is None]
    discoveries = [h for h in hist if h.action == "explored" and (h.new_value or {}).get("first_time")]
    changes = [h for h in hist if h.action in ("added", "removed", "strength_changed", "favourited", "unfavourited")]
    return {
        "initial_domain_ids": [str(h.domain_id) for h in initial],
        "current": [{"domain_id": str(i.domain_id), "subdomain_id": str(i.subdomain_id) if i.subdomain_id else None,
                     "strength": i.strength, "is_favourite": i.is_favourite} for i in active_interests(db, student_id)],
        "change_count": len(changes),
        "new_discoveries": [{"domain_id": str(h.domain_id), "at": h.created_at.isoformat()} for h in discoveries],
        "timeline": hist,
    }
