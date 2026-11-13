from __future__ import annotations


def normalize_score(raw: float | None, max_score: float | None) -> float | None:
    """Normalise a raw score to 0..100.

    Returns None when it cannot be done safely (missing values or a
    non-positive maximum) instead of dividing by zero.
    """
    if raw is None or max_score is None or max_score <= 0:
        return None
    pct = (float(raw) / float(max_score)) * 100.0
    return round(min(max(pct, 0.0), 100.0), 2)


def clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))
