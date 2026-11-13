"""Multidimensional, explainable domain score.

Produces four separately stored measurements:
  A. interest_score  - preference (from interest signals only)
  B. skill_score     - demonstrated skill (weighted dimensions)
  C. progress_score  - learning progress within comparable assessments
  D. confidence      - how trustworthy B and C are
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np

from ..types import DimensionResult, DomainEvidence, DomainScoreResult, EvidenceRecord, InterestSignal
from .confidence import aware, confidence_label, evidence_confidence
from .config import ScoringConfig
from .interest import interest_score
from .normalization import clamp

PROBLEM_SOLVING_CATEGORIES = {
    "logical_puzzle",
    "coding_challenge",
    "science_experiment",
    "business_simulation",
    "research_task",
}
CREATIVE_CATEGORIES = {"creative_assignment", "practical_project", "public_speaking"}


def _recency_weighted_mean(records: list[EvidenceRecord], now: datetime, half_life: float) -> float:
    weights, values = [], []
    for r in records:
        age = max((now - aware(r.occurred_at)).total_seconds() / 86400.0, 0.0)
        weights.append(math.pow(0.5, age / half_life))
        values.append(r.score_pct)
    return float(np.average(values, weights=weights))


def _dimension_from_tags(
    records: list[EvidenceRecord], key: str, fallback_categories: set[str]
) -> tuple[float | None, str]:
    tagged = [r.dimension_scores[key] for r in records if key in r.dimension_scores]
    label = key.replace("_", " ")
    if tagged:
        return round(statistics.fmean(tagged), 1), f"Average of {len(tagged)} rubric-rated {label} criteria."
    fallback = [r.score_pct for r in records if r.category in fallback_categories]
    if fallback:
        return round(statistics.fmean(fallback), 1), f"Average score across {len(fallback)} {label} activities."
    return None, f"No activity has measured {label} yet."


def learning_progress(records: list[EvidenceRecord]) -> tuple[float | None, str]:
    """Progress is measured only inside a scale_key (same assessment/activity),
    so incompatible assessments are never compared directly. 50 = no change."""
    groups: dict[str, list[EvidenceRecord]] = defaultdict(list)
    for r in records:
        groups[r.scale_key].append(r)
    deltas: list[float] = []
    for items in groups.values():
        if len(items) < 2:
            continue
        items.sort(key=lambda r: aware(r.occurred_at))
        deltas.append(items[-1].score_pct - items[0].score_pct)

    # Difficulty progression: taking on harder work while still succeeding.
    ordered = sorted(records, key=lambda r: aware(r.occurred_at))
    if len(ordered) >= 4:
        half = len(ordered) // 2
        early = statistics.fmean(r.difficulty for r in ordered[:half])
        late = statistics.fmean(r.difficulty for r in ordered[half:])
        late_scores = statistics.fmean(r.score_pct for r in ordered[half:])
        if late > early and late_scores >= 50:
            deltas.append(min((late - early) * 10.0, 30.0))

    if not deltas:
        return None, "Needs two attempts of the same assessment or activity to measure progress."
    mean_delta = statistics.fmean(deltas)
    value = round(clamp(50.0 + mean_delta), 1)
    direction = "improved" if mean_delta > 0 else ("held steady" if mean_delta == 0 else "dipped")
    return value, f"Scores {direction} by {mean_delta:+.1f} points on average across {len(deltas)} comparable signal(s)."


def _consistency(records: list[EvidenceRecord]) -> tuple[float | None, str]:
    if len(records) < 3:
        return None, "Needs at least three completed items."
    dates = sorted(aware(r.occurred_at) for r in records)
    span_weeks = max(math.ceil((dates[-1] - dates[0]).days / 7.0), 1)
    active_weeks = len({d.isocalendar()[:2] for d in dates})
    regularity = min(active_weeks / span_weeks, 1.0)
    spread = statistics.pstdev([r.score_pct for r in records])
    stability = clamp(1.0 - spread / 50.0, 0.0, 1.0)
    value = round((regularity * 0.6 + stability * 0.4) * 100, 1)
    return value, f"Active in {active_weeks} of ~{span_weeks} week(s); score stability {stability:.0%}."


def _engagement(ev: DomainEvidence) -> tuple[float | None, str]:
    if ev.assigned_count == 0 and ev.completed_count == 0 and ev.voluntary_count == 0:
        return None, "No activity yet."
    completion = min(ev.completed_count / ev.assigned_count, 1.0) if ev.assigned_count else 1.0
    voluntary = min(ev.voluntary_count / 5.0, 1.0)
    value = round(clamp((completion * 0.7 + voluntary * 0.3) * 100), 1)
    return value, f"Completed {ev.completed_count} of {ev.assigned_count} assigned; {ev.voluntary_count} chosen voluntarily."


def _adaptability(records: list[EvidenceRecord]) -> tuple[float | None, str]:
    harder = [r.score_pct for r in records if r.difficulty >= 3]
    if len(harder) < 2:
        return None, "Needs two attempts at difficulty level 3 or above."
    value = round(statistics.fmean(harder), 1)
    return value, f"Average {value:.0f}% across {len(harder)} harder (level 3+) challenges."


def score_domain(
    evidence: DomainEvidence,
    interest: InterestSignal | None,
    config: ScoringConfig | None = None,
    now: datetime | None = None,
) -> DomainScoreResult:
    config = config or ScoringConfig()
    now = aware(now or datetime.now(timezone.utc))
    records = evidence.records
    half_life = config.threshold("recency_half_life_days")

    dims: dict[str, tuple[float | None, str]] = {}
    if records:
        perf = round(_recency_weighted_mean(records, now, half_life), 1)
        dims["performance"] = (perf, f"Recency-weighted average of {len(records)} normalised scores.")
    else:
        dims["performance"] = (None, "No completed work yet.")
    dims["learning_progress"] = learning_progress(records)
    dims["problem_solving"] = _dimension_from_tags(records, "problem_solving", PROBLEM_SOLVING_CATEGORIES)
    dims["creativity"] = _dimension_from_tags(records, "creativity", CREATIVE_CATEGORIES)
    dims["consistency"] = _consistency(records)
    dims["engagement"] = _engagement(evidence)
    dims["adaptability"] = _adaptability(records)

    dimension_results = [
        DimensionResult(key=k, value=dims[k][0], weight=config.weights[k], explanation=dims[k][1])
        for k in config.weights
    ]

    available = [d for d in dimension_results if d.value is not None and d.weight > 0]
    covered = sum(d.weight for d in available)
    skill: float | None = None
    explanation: list[str] = []
    if records and covered >= config.threshold("min_covered_weight"):
        skill = round(sum(d.value * d.weight for d in available) / covered, 1)  # type: ignore[operator]
        explanation.append(
            f"Skill score combines {len(available)} of {len(dimension_results)} dimensions "
            f"covering {covered:.0%} of the configured weight."
        )
    elif records:
        explanation.append("Not enough different kinds of evidence yet to compute a skill score.")
    else:
        explanation.append("No demonstrated evidence in this domain yet. This is unexplored, not a weakness.")

    missing = [d.key.replace("_", " ") for d in dimension_results if d.value is None]
    if missing and records:
        explanation.append("Not yet measured: " + ", ".join(missing) + ".")

    conf, breakdown = evidence_confidence(records, config, now)
    label = confidence_label(conf, len(records))
    sufficient = len(records) >= config.threshold("min_evidence") and conf >= config.threshold("min_confidence")
    explanation.append(
        f"Evidence confidence is {label} ({conf:.2f}) from {len(records)} record(s)."
        + ("" if sufficient else " More evidence is needed before drawing conclusions.")
    )
    validated_advanced = any(r.mentor_validated and r.difficulty >= 4 and r.score_pct >= 60 for r in records)

    return DomainScoreResult(
        domain_id=evidence.domain_id,
        interest_score=interest_score(interest),
        skill_score=skill,
        progress_score=dims["learning_progress"][0],
        confidence=conf,
        confidence_label=label,  # type: ignore[arg-type]
        evidence_count=len(records),
        sufficiently_assessed=sufficient,
        dimensions=dimension_results,
        explanation=explanation,
        confidence_breakdown=breakdown,
        validated_advanced=validated_advanced,
    )
