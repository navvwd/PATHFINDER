"""Interest score: derived only from the student's own choices and voluntary
behaviour. It is never mixed with performance."""

from __future__ import annotations

from ..types import InterestSignal


def interest_score(signal: InterestSignal | None) -> float | None:
    if signal is None:
        return None
    if not signal.selected and signal.voluntary_explorations == 0:
        return None
    score = 0.0
    if signal.selected:
        score += 40.0 + (min(max(signal.strength, 1), 5) - 1) * 7.5  # 40..70
    if signal.is_favourite:
        score += 10.0
    score += min(signal.voluntary_explorations, 10) * 1.5  # up to +15
    score += min(signal.subdomain_count, 5) * 1.0  # up to +5
    return round(min(score, 100.0), 1)
