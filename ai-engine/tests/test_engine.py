from datetime import datetime, timedelta, timezone

import pytest

from pathfinder_engine import DomainEvidence, EvidenceRecord, InterestSignal
from pathfinder_engine.analytics import improvement_percentage, summarize_progress, trend_slope
from pathfinder_engine.recommendation import ActivityCandidate, DomainInfo, generate_recommendations
from pathfinder_engine.report_generation import build_roadmap
from pathfinder_engine.scoring import (
    DEFAULT_WEIGHTS,
    InvalidScoringConfig,
    ScoringConfig,
    normalize_score,
    score_domain,
    validate_weights,
)

NOW = datetime(2026, 11, 1, tzinfo=timezone.utc)


def rec(domain="stem", score=70.0, days_ago=1, key="a1", kind="activity", diff=2, cat="coding_challenge", **kw):
    return EvidenceRecord(domain_id=domain, kind=kind, score_pct=score, occurred_at=NOW - timedelta(days=days_ago),
                          scale_key=key, category=cat, difficulty=diff, **kw)


# ---------- normalisation / safety ----------

def test_normalize_handles_zero_and_missing():
    assert normalize_score(5, 10) == 50.0
    assert normalize_score(5, 0) is None
    assert normalize_score(None, 10) is None
    assert normalize_score(15, 10) == 100.0


def test_improvement_never_divides_by_zero():
    assert improvement_percentage(0, 50) is None
    assert improvement_percentage(None, 50) is None
    assert improvement_percentage(50, 75) == 50.0


def test_weights_validation():
    assert validate_weights(DEFAULT_WEIGHTS) == DEFAULT_WEIGHTS
    bad = dict(DEFAULT_WEIGHTS, performance=0.5)
    with pytest.raises(InvalidScoringConfig):
        validate_weights(bad)
    with pytest.raises(InvalidScoringConfig):
        validate_weights({**DEFAULT_WEIGHTS, "iq": 0.0})


# ---------- scoring ----------

def test_no_evidence_is_unexplored_not_weak():
    r = score_domain(DomainEvidence("arts", []), InterestSignal("arts", selected=True, strength=5), now=NOW)
    assert r.skill_score is None
    assert r.confidence == 0
    assert r.confidence_label == "none"
    assert r.interest_score is not None and r.interest_score >= 70
    assert any("not a weakness" in e for e in r.explanation)
    assert not r.sufficiently_assessed


def test_interest_and_skill_are_separate():
    records = [rec(score=90, days_ago=d, key=f"k{d}", diff=3) for d in (1, 8, 15, 22)]
    r = score_domain(DomainEvidence("stem", records, assigned_count=4, completed_count=4), None, now=NOW)
    assert r.interest_score is None  # never selected -> no interest score
    assert r.skill_score is not None and r.skill_score > 70


def test_progress_only_within_comparable_groups():
    # Two different assessments: 30 then 90 must NOT read as +60 improvement.
    records = [rec(score=30, days_ago=20, key="quiz-A"), rec(score=90, days_ago=1, key="quiz-B")]
    r = score_domain(DomainEvidence("stem", records), None, now=NOW)
    assert r.progress_score is None
    # Same assessment repeated -> measurable progress.
    records = [rec(score=40, days_ago=20, key="quiz-A"), rec(score=80, days_ago=1, key="quiz-A")]
    r = score_domain(DomainEvidence("stem", records), None, now=NOW)
    assert r.progress_score == 90.0


def test_confidence_grows_with_diverse_validated_evidence():
    thin = [rec()]
    rich = [rec(score=80, days_ago=i * 5, key=f"k{i}", kind=k, cat=c, mentor_validated=True, evidence_quality=0.9)
            for i, (k, c) in enumerate([("activity", "coding_challenge"), ("assessment", "quiz"),
                                         ("project", "practical_project"), ("activity", "logical_puzzle"),
                                         ("assessment", "quiz"), ("project", "research_task"),
                                         ("activity", "coding_challenge"), ("assessment", "quiz")])]
    a = score_domain(DomainEvidence("stem", thin), None, now=NOW)
    b = score_domain(DomainEvidence("stem", rich, assigned_count=8, completed_count=8), None, now=NOW)
    assert b.confidence > a.confidence
    assert b.sufficiently_assessed and not a.sufficiently_assessed
    assert b.confidence_label == "high"


def test_custom_weights_change_score():
    records = [rec(score=s, days_ago=d, key="same", cat=c, diff=3)
               for s, d, c in ((40, 30, "creative_assignment"), (60, 20, "coding_challenge"), (95, 2, "coding_challenge"))]
    ev = DomainEvidence("stem", records, assigned_count=3, completed_count=3)
    base = score_domain(ev, None, now=NOW)
    w = {k: 0.0 for k in DEFAULT_WEIGHTS}
    w["learning_progress"] = 1.0
    prog_only = score_domain(ev, None, ScoringConfig(weights=w), now=NOW)
    assert prog_only.skill_score == prog_only.progress_score
    assert base.skill_score != prog_only.skill_score


# ---------- analytics ----------

def test_trend_requires_enough_points():
    assert trend_slope([(NOW, 10)]) is None
    pts = [(NOW - timedelta(days=30), 40), (NOW - timedelta(days=15), 55), (NOW, 70)]
    assert trend_slope(pts) == pytest.approx(30.0, rel=0.01)


def test_summarize_progress_patterns():
    # exceptional improvement from average start
    records = [rec(score=s, days_ago=d, key="q") for s, d in ((50, 60), (65, 40), (80, 20), (92, 2))]
    s = summarize_progress(records, assigned=5, completed=4, now=NOW)
    assert s.trend_label == "improving"
    assert s.initial_performance == 50 and s.current_performance == 92
    assert s.completion_rate == 80.0
    # no comparable repeats
    s2 = summarize_progress([rec(key="x"), rec(key="y")], now=NOW)
    assert s2.improvement_points is None and s2.trend_label == "insufficient_data"


# ---------- recommendations ----------

DOMAINS = [DomainInfo(i, n) for i, n in [("stem", "STEM"), ("arts", "Arts"), ("biz", "Business"),
                                          ("comm", "Communication"), ("sci", "Science"), ("sport", "Sports")]]
ACTS = [ActivityCandidate(f"{d.id}-{lvl}", f"{d.name} L{lvl}", d.id, lvl, "general") for d in DOMAINS for lvl in (1, 2, 3, 4)]


def test_insufficient_data_produces_no_promising_domains():
    interests = [InterestSignal("arts", selected=True)]
    scores = [score_domain(DomainEvidence("arts", [rec("arts")]), interests[0], now=NOW)]
    res = generate_recommendations(DOMAINS, interests, scores, ACTS, set())
    assert res.status == "insufficient_data"
    assert res.promising_domains == []
    assert all(i.kind in ("activity", "explore_domain", "alignment") for i in res.items)
    # never labels untested domains as weak
    assert not any("weak" in " ".join(i.reasons).lower() or "weak" in i.title.lower() for i in res.items)


def test_promising_and_focus_domains():
    def strong(dom, score, validated):
        return [rec(dom, score, days_ago=i * 4, key=f"{dom}{i % 2}", kind=k, cat=c, diff=4 if validated and i == 0 else 2,
                    mentor_validated=validated, evidence_quality=0.8)
                for i, (k, c) in enumerate([("activity", "coding_challenge"), ("assessment", "quiz"), ("project", "practical_project"),
                                             ("activity", "logical_puzzle"), ("assessment", "quiz"), ("project", "creative_assignment")])]
    interests = [InterestSignal(d.id, selected=d.id in ("stem", "arts")) for d in DOMAINS]
    scores = [
        score_domain(DomainEvidence("stem", strong("stem", 88, True), 6, 6), interests[0], now=NOW),
        score_domain(DomainEvidence("arts", strong("arts", 82, True), 6, 6), interests[1], now=NOW),
        score_domain(DomainEvidence("biz", strong("biz", 60, False), 6, 6), interests[2], now=NOW),
        score_domain(DomainEvidence("comm", strong("comm", 50, False), 6, 6), interests[3], now=NOW),
    ]
    res = generate_recommendations(DOMAINS, interests, scores, ACTS, {"stem-1"})
    assert res.status == "ok"
    assert len(res.promising_domains) == 3
    assert set(res.focus_domains) == {"stem", "arts"}
    # completed activity is not suggested again
    assert all(i.activity_id != "stem-1" for i in res.items)
    # unexplored domains are invitations
    explore = [i for i in res.items if i.kind == "explore_domain"]
    assert {i.domain_id for i in explore} == {"sci", "sport"}
    assert all(i.reasons for i in res.items)


def test_roadmap_horizons():
    r = build_roadmap(30, [{"id": "stem", "name": "STEM"}],
                      [{"id": f"a{i}", "title": f"A{i}", "domain_id": "stem", "difficulty": i % 4 + 1} for i in range(8)],
                      [{"title": "Docs", "url": "https://example.org", "domain_id": "stem"}])
    assert r["milestones"] and r["objectives"]
    assert max(m["due_day"] for m in r["milestones"]) <= 30
    with pytest.raises(ValueError):
        build_roadmap(10, [], [], [])
