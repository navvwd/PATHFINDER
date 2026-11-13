"""Safe progress analytics.

Rules enforced here:
* never divide by zero (improvement against a zero/absent baseline is None)
* never compare incompatible assessments (comparisons happen per scale_key)
* historical points are inputs, never mutated
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Literal

import numpy as np

from ..scoring.confidence import aware
from ..types import EvidenceRecord

Period = Literal["daily", "weekly", "monthly"]


def improvement_percentage(initial: float | None, current: float | None) -> float | None:
    """Relative improvement. Returns None when the baseline is missing or zero."""
    if initial is None or current is None or initial <= 0:
        return None
    return round((current - initial) / initial * 100.0, 1)


def completion_rate(completed: int, assigned: int) -> float | None:
    if assigned <= 0:
        return None
    return round(min(completed / assigned, 1.0) * 100.0, 1)


def trend_slope(points: list[tuple[datetime, float]]) -> float | None:
    """Least-squares slope in score points per 30 days. Needs >= 3 points
    spanning at least one day."""
    if len(points) < 3:
        return None
    pts = sorted(((aware(t), v) for t, v in points), key=lambda p: p[0])
    t0 = pts[0][0]
    xs = np.array([(t - t0).total_seconds() / 86400.0 for t, _ in pts])
    if xs.max() - xs.min() < 1.0:
        return None
    ys = np.array([v for _, v in pts])
    slope = float(np.polyfit(xs, ys, 1)[0])
    return round(slope * 30.0, 2)


def consistency_score(activity_dates: Iterable[datetime], window_days: int = 28, now: datetime | None = None) -> float | None:
    """Share of weeks in the window with at least one completed item."""
    now = aware(now or datetime.now(timezone.utc))
    start = now - timedelta(days=window_days)
    dates = [aware(d) for d in activity_dates if aware(d) >= start]
    weeks_in_window = max(window_days // 7, 1)
    if not dates:
        return 0.0
    active = len({d.isocalendar()[:2] for d in dates})
    return round(min(active / weeks_in_window, 1.0) * 100.0, 1)


def _period_start(d: datetime, period: Period) -> date:
    day = aware(d).date()
    if period == "daily":
        return day
    if period == "weekly":
        return day - timedelta(days=day.weekday())
    return day.replace(day=1)


def bucket_scores(records: list[EvidenceRecord], period: Period) -> list[dict]:
    buckets: dict[date, list[float]] = defaultdict(list)
    for r in records:
        buckets[_period_start(r.occurred_at, period)].append(r.score_pct)
    return [
        {"period_start": k.isoformat(), "count": len(v), "average_score": round(statistics.fmean(v), 1)}
        for k, v in sorted(buckets.items())
    ]


@dataclass
class ProgressSummary:
    evidence_count: int
    initial_performance: float | None
    current_performance: float | None
    average_performance: float | None
    improvement_points: float | None  # average per comparable group, in score points
    improvement_percentage: float | None
    trend_per_30_days: float | None
    trend_label: Literal["improving", "steady", "declining", "insufficient_data"]
    comparable_groups: int
    completion_rate: float | None
    consistency: float | None
    notes: list[str]

    def to_dict(self) -> dict:
        return asdict(self)


def summarize_progress(
    records: list[EvidenceRecord],
    assigned: int = 0,
    completed: int = 0,
    now: datetime | None = None,
) -> ProgressSummary:
    notes: list[str] = []
    if not records:
        return ProgressSummary(0, None, None, None, None, None, None, "insufficient_data", 0,
                               completion_rate(completed, assigned), 0.0, ["No completed work yet."])

    ordered = sorted(records, key=lambda r: aware(r.occurred_at))
    groups: dict[str, list[EvidenceRecord]] = defaultdict(list)
    for r in ordered:
        groups[r.scale_key].append(r)
    comparable = {k: v for k, v in groups.items() if len(v) >= 2}

    initial = current = None
    deltas: list[float] = []
    pct: list[float] = []
    if comparable:
        firsts = [v[0].score_pct for v in comparable.values()]
        lasts = [v[-1].score_pct for v in comparable.values()]
        initial = round(statistics.fmean(firsts), 1)
        current = round(statistics.fmean(lasts), 1)
        for v in comparable.values():
            deltas.append(v[-1].score_pct - v[0].score_pct)
            p = improvement_percentage(v[0].score_pct, v[-1].score_pct)
            if p is not None:
                pct.append(p)
    else:
        notes.append("Improvement is only measured on repeated, comparable assessments - none yet.")

    # Trend uses per-group *deviation from that group's first score* so different
    # scales are not mixed into a single regression line.
    trend_points: list[tuple[datetime, float]] = []
    for v in comparable.values():
        base = v[0].score_pct
        trend_points.extend((r.occurred_at, r.score_pct - base) for r in v)
    slope = trend_slope(trend_points)
    if slope is None:
        label = "insufficient_data"
    elif slope > 2:
        label = "improving"
    elif slope < -2:
        label = "declining"
    else:
        label = "steady"

    return ProgressSummary(
        evidence_count=len(records),
        initial_performance=initial,
        current_performance=current,
        average_performance=round(statistics.fmean(r.score_pct for r in records), 1),
        improvement_points=round(statistics.fmean(deltas), 1) if deltas else None,
        improvement_percentage=round(statistics.fmean(pct), 1) if pct else None,
        trend_per_30_days=slope,
        trend_label=label,  # type: ignore[arg-type]
        comparable_groups=len(comparable),
        completion_rate=completion_rate(completed, assigned),
        consistency=consistency_score([r.occurred_at for r in records], now=now),
        notes=notes,
    )
