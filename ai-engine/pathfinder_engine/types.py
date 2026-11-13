"""Plain data structures shared by every engine module."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Literal

EvidenceKind = Literal["activity", "assessment", "project", "mentor_observation"]


@dataclass(frozen=True)
class EvidenceRecord:
    """One piece of *demonstrated* evidence (never interest).

    ``score_pct`` is normalised to 0..100 relative to the item's own maximum.
    ``scale_key`` groups items that are directly comparable (same assessment or
    same activity). Learning progress is only computed *within* a scale_key, so
    incompatible assessments are never compared.
    """

    domain_id: str
    kind: EvidenceKind
    score_pct: float
    occurred_at: datetime
    scale_key: str
    category: str = "general"
    subdomain_id: str | None = None
    difficulty: int = 1  # 1..5
    attempt_no: int = 1
    mentor_validated: bool = False
    evidence_quality: float = 0.5  # 0..1 practical artefact richness
    dimension_scores: dict[str, float] = field(default_factory=dict)  # rubric-tagged 0..100


@dataclass(frozen=True)
class InterestSignal:
    """What the student *chose*: preference, not performance."""

    domain_id: str
    selected: bool
    strength: int = 3  # 1..5 self-reported
    is_favourite: bool = False
    voluntary_explorations: int = 0
    subdomain_count: int = 0


@dataclass
class DomainEvidence:
    domain_id: str
    records: list[EvidenceRecord]
    assigned_count: int = 0
    completed_count: int = 0
    voluntary_count: int = 0


@dataclass
class DimensionResult:
    key: str
    value: float | None  # None = not enough evidence for this dimension
    weight: float
    explanation: str


ConfidenceLabel = Literal["none", "low", "moderate", "high"]


@dataclass
class DomainScoreResult:
    domain_id: str
    interest_score: float | None
    skill_score: float | None
    progress_score: float | None
    confidence: float
    confidence_label: ConfidenceLabel
    evidence_count: int
    sufficiently_assessed: bool
    dimensions: list[DimensionResult]
    explanation: list[str]
    confidence_breakdown: dict[str, float]
    validated_advanced: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
