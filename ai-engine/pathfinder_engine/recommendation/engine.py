"""Explainable recommendation engine.

Pipeline (mirrors the product specification):
 1. selected interests            -> ``interests``
 2./3. activity + assessment data  -> ``scores`` (already computed per domain)
 4. domain-wise performance        -> skill/progress scores
 5. development trends             -> progress_score
 6. interest vs evidence           -> alignment notes
 7. activity suggestions           -> adaptive difficulty, not yet completed
 8. extra domains to explore       -> never framed as weaknesses
 9. promising domains              -> top 3 among *sufficiently assessed* only,
                                      then top 2 after advanced validation

Guarantees:
* no recommendation is produced from insufficient data (status says so)
* other interests are never removed
* untested domains are "not yet explored", never weaknesses
* every item carries human-readable reasons and the evidence it used
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

from ..types import DomainScoreResult, InterestSignal

RecKind = Literal["activity", "explore_domain", "promising_domain", "focus_domain", "validation", "alignment"]


@dataclass(frozen=True)
class DomainInfo:
    id: str
    name: str


@dataclass(frozen=True)
class ActivityCandidate:
    id: str
    title: str
    domain_id: str
    difficulty: int
    category: str
    subdomain_id: str | None = None
    age_eligible: bool = True


@dataclass
class Recommendation:
    kind: RecKind
    title: str
    reasons: list[str]
    domain_id: str | None = None
    activity_id: str | None = None
    confidence: float = 0.0
    evidence: dict = field(default_factory=dict)
    priority: int = 50


@dataclass
class RecommendationResult:
    status: Literal["ok", "insufficient_data"]
    message: str
    promising_domains: list[str]
    focus_domains: list[str]
    items: list[Recommendation]
    disclaimer: str = (
        "These suggestions are based on recorded activities and the interests you chose. "
        "They are not a test of intelligence or a diagnosis, and you are free to disagree."
    )

    def to_dict(self) -> dict:
        return asdict(self)


def target_difficulty(score: DomainScoreResult | None) -> int:
    """Adaptive difficulty: step up after strong work, step down after struggle."""
    if score is None or score.skill_score is None:
        return 1
    perf = next((d.value for d in score.dimensions if d.key == "performance"), None) or score.skill_score
    base = 2
    if perf >= 85:
        base = 4
    elif perf >= 70:
        base = 3
    elif perf < 45:
        base = 1
    return base


def _promise(score: DomainScoreResult) -> float:
    skill = score.skill_score or 0.0
    progress = score.progress_score if score.progress_score is not None else 50.0
    return skill * 0.6 + progress * 0.25 + score.confidence * 100 * 0.15


def generate_recommendations(
    domains: list[DomainInfo],
    interests: list[InterestSignal],
    scores: list[DomainScoreResult],
    activities: list[ActivityCandidate],
    completed_activity_ids: set[str],
    max_activities_per_domain: int = 2,
) -> RecommendationResult:
    names = {d.id: d.name for d in domains}
    by_domain = {s.domain_id: s for s in scores}
    selected = {i.domain_id for i in interests if i.selected}
    items: list[Recommendation] = []

    sufficient = [s for s in scores if s.sufficiently_assessed and s.skill_score is not None]

    # --- 6. interest vs evidence alignment (preference is reported separately) ---
    for dom_id in selected:
        s = by_domain.get(dom_id)
        n = names.get(dom_id, dom_id)
        if s is None or s.evidence_count == 0:
            items.append(Recommendation(
                kind="alignment", domain_id=dom_id, priority=60,
                title=f"Start building evidence in {n}",
                reasons=[f"You chose {n} as an interest.", "No activities completed here yet, so there is nothing to measure."],
            ))
        elif not s.sufficiently_assessed:
            items.append(Recommendation(
                kind="alignment", domain_id=dom_id, priority=55, confidence=s.confidence,
                title=f"Keep exploring {n}",
                reasons=[f"You chose {n} as an interest.",
                         f"Only {s.evidence_count} record(s) so far ({s.confidence_label} confidence) - too early to judge."],
                evidence={"evidence_count": s.evidence_count, "confidence": s.confidence},
            ))
        else:
            items.append(Recommendation(
                kind="alignment", domain_id=dom_id, priority=40, confidence=s.confidence,
                title=f"Your interest in {n} is backed by real work",
                reasons=[f"You chose {n} as an interest.",
                         f"Demonstrated skill score {s.skill_score:.0f}/100 from {s.evidence_count} records."],
                evidence={"skill_score": s.skill_score, "progress_score": s.progress_score},
            ))
    for s in sufficient:
        if s.domain_id not in selected and (s.skill_score or 0) >= 70:
            n = names.get(s.domain_id, s.domain_id)
            items.append(Recommendation(
                kind="alignment", domain_id=s.domain_id, priority=45, confidence=s.confidence,
                title=f"You may enjoy exploring {n} further",
                reasons=[f"You have not selected {n} as an interest, which is completely fine.",
                         f"Your completed work here scores {s.skill_score:.0f}/100 - adding it is your choice."],
                evidence={"skill_score": s.skill_score},
            ))

    # --- 9. promising domains (top 3 among sufficiently assessed only) ---
    ranked = sorted(sufficient, key=_promise, reverse=True)
    promising = [s.domain_id for s in ranked[:3]]
    focus: list[str] = []
    validated = [s for s in ranked[:3] if s.validated_advanced]
    if len(validated) >= 2:
        focus = [s.domain_id for s in validated[:2]]
    for rank, s in enumerate(ranked[:3], start=1):
        n = names.get(s.domain_id, s.domain_id)
        reasons = [
            f"Ranked #{rank} of {len(sufficient)} sufficiently assessed domain(s) by demonstrated evidence.",
            f"Skill {s.skill_score:.0f}/100, progress {s.progress_score if s.progress_score is not None else 'n/a'}, confidence {s.confidence_label}.",
        ]
        if s.domain_id in focus:
            items.append(Recommendation(kind="focus_domain", domain_id=s.domain_id, priority=10,
                                        confidence=s.confidence, title=f"{n}: a promising area to go deeper",
                                        reasons=reasons + ["Advanced practical work was validated by a mentor."],
                                        evidence={"skill_score": s.skill_score}))
        else:
            items.append(Recommendation(kind="promising_domain", domain_id=s.domain_id, priority=20,
                                        confidence=s.confidence, title=f"{n} looks promising",
                                        reasons=reasons, evidence={"skill_score": s.skill_score}))
            if not s.validated_advanced:
                items.append(Recommendation(kind="validation", domain_id=s.domain_id, priority=25,
                                            confidence=s.confidence,
                                            title=f"Try an advanced practical challenge in {n}",
                                            reasons=["Advanced practical validation (level 4+, mentor reviewed) "
                                                     "confirms whether this area is a strong fit."]))

    # --- 7. activity suggestions (adaptive, not completed, age eligible) ---
    for dom_id in sorted(selected | set(promising)):
        s = by_domain.get(dom_id)
        target = target_difficulty(s)
        pool = [a for a in activities if a.domain_id == dom_id and a.age_eligible and a.id not in completed_activity_ids]
        pool.sort(key=lambda a: (abs(a.difficulty - target), a.difficulty))
        for a in pool[:max_activities_per_domain]:
            reason = [f"Matches your {'chosen interest' if dom_id in selected else 'promising area'}: {names.get(dom_id, dom_id)}."]
            if s and s.skill_score is not None:
                reason.append(f"Difficulty {a.difficulty} chosen to fit your current level (target {target}).")
            else:
                reason.append("A good starting point while we gather evidence.")
            items.append(Recommendation(kind="activity", domain_id=dom_id, activity_id=a.id, title=a.title,
                                        priority=30, reasons=reason, confidence=s.confidence if s else 0.0))

    # --- 8. extra domains to explore ---
    explored = {s.domain_id for s in scores if s.evidence_count > 0}
    for d in domains:
        if d.id not in selected and d.id not in explored:
            items.append(Recommendation(kind="explore_domain", domain_id=d.id, priority=70,
                                        title=f"Not yet explored: {d.name}",
                                        reasons=["You have not tried this domain yet. A short starter activity "
                                                 "could reveal a new interest."]))

    items.sort(key=lambda r: r.priority)
    if not sufficient:
        return RecommendationResult(
            status="insufficient_data",
            message="Not enough evidence yet to identify promising domains. Keep exploring the activities below.",
            promising_domains=[], focus_domains=[],
            items=[i for i in items if i.kind in ("activity", "explore_domain", "alignment")],
        )
    msg = f"Based on {sum(s.evidence_count for s in scores)} records across {len(explored)} explored domain(s)."
    return RecommendationResult(status="ok", message=msg, promising_domains=promising, focus_domains=focus, items=items)
