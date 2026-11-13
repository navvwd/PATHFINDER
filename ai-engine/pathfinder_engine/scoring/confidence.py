"""Evidence confidence: how much should anyone trust a domain score?

Considers number of completed activities, assessment diversity, recency,
mentor validation and practical evidence quality.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone

from ..types import EvidenceRecord
from .config import ScoringConfig

CONFIDENCE_WEIGHTS = {
    "volume": 0.30,
    "diversity": 0.20,
    "recency": 0.15,
    "mentor_validation": 0.20,
    "evidence_quality": 0.15,
}


def aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def evidence_confidence(
    records: list[EvidenceRecord], config: ScoringConfig, now: datetime | None = None
) -> tuple[float, dict[str, float]]:
    if not records:
        return 0.0, {k: 0.0 for k in CONFIDENCE_WEIGHTS}
    now = aware(now or datetime.now(timezone.utc))

    volume = min(len(records) / config.threshold("volume_saturation"), 1.0)

    kinds = {r.kind for r in records}
    categories = {r.category for r in records}
    diversity = min(max(len(kinds) / 3.0, len(categories) / 4.0), 1.0)

    newest = max(aware(r.occurred_at) for r in records)
    age_days = max((now - newest).total_seconds() / 86400.0, 0.0)
    recency = math.pow(0.5, age_days / config.threshold("recency_half_life_days"))

    validated = sum(1 for r in records if r.mentor_validated)
    mentor_validation = min(validated / 2.0, 1.0)

    quality = sum(min(max(r.evidence_quality, 0.0), 1.0) for r in records) / len(records)

    parts = {
        "volume": round(volume, 3),
        "diversity": round(diversity, 3),
        "recency": round(recency, 3),
        "mentor_validation": round(mentor_validation, 3),
        "evidence_quality": round(quality, 3),
    }
    total = sum(parts[k] * w for k, w in CONFIDENCE_WEIGHTS.items())
    return round(total, 3), parts


def confidence_label(value: float, evidence_count: int) -> str:
    if evidence_count == 0:
        return "none"
    if value < 0.4:
        return "low"
    if value < 0.7:
        return "moderate"
    return "high"
