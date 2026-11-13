"""Scoring configuration.

Administrators can change weights; the backend stores every change as a new
row in ``scoring_configs`` so historical scores stay explainable.
"""

from __future__ import annotations

from dataclasses import dataclass, field

DIMENSIONS = (
    "performance",
    "learning_progress",
    "problem_solving",
    "creativity",
    "consistency",
    "engagement",
    "adaptability",
)

DEFAULT_WEIGHTS: dict[str, float] = {
    "performance": 0.20,
    "learning_progress": 0.20,
    "problem_solving": 0.15,
    "creativity": 0.15,
    "consistency": 0.10,
    "engagement": 0.10,
    "adaptability": 0.10,
}

DEFAULT_THRESHOLDS: dict[str, float] = {
    "min_evidence": 3,  # records before a domain is "sufficiently assessed"
    "min_confidence": 0.40,  # evidence confidence (0..1) for the same
    "recency_half_life_days": 60,
    "volume_saturation": 8,  # records at which volume confidence saturates
    "min_covered_weight": 0.35,  # share of weights needed to publish a skill score
}


class InvalidScoringConfig(ValueError):
    pass


def validate_weights(weights: dict[str, float]) -> dict[str, float]:
    unknown = set(weights) - set(DIMENSIONS)
    if unknown:
        raise InvalidScoringConfig(f"Unknown dimensions: {sorted(unknown)}")
    missing = set(DIMENSIONS) - set(weights)
    if missing:
        raise InvalidScoringConfig(f"Missing dimensions: {sorted(missing)}")
    if any(float(w) < 0 for w in weights.values()):
        raise InvalidScoringConfig("Weights must be non-negative")
    total = sum(float(w) for w in weights.values())
    if abs(total - 1.0) > 1e-6:
        raise InvalidScoringConfig(f"Weights must sum to 1.0 (got {total:.4f})")
    return {k: float(weights[k]) for k in DIMENSIONS}


@dataclass(frozen=True)
class ScoringConfig:
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    thresholds: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_THRESHOLDS))
    version: int = 1

    def __post_init__(self) -> None:
        validate_weights(self.weights)

    def threshold(self, key: str) -> float:
        return float(self.thresholds.get(key, DEFAULT_THRESHOLDS[key]))
