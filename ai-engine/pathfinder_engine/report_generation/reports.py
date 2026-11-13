"""Deterministic, record-grounded reports and roadmaps.

These are used directly (no LLM configured) and as the grounding facts and
fallback when an LLM provider is available. Every sentence is derived from
numbers passed in - nothing is inferred about the child as a person.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class DomainFact:
    domain_id: str
    name: str
    selected: bool
    skill_score: float | None
    progress_score: float | None
    confidence_label: str
    evidence_count: int


@dataclass
class ReportFacts:
    student_first_name: str
    period_label: str
    activities_completed: int
    assessments_completed: int
    xp_earned: int
    streak_days: int
    domains: list[DomainFact]
    recent_feedback: list[str] = field(default_factory=list)
    achievements: list[str] = field(default_factory=list)
    trend_label: str = "insufficient_data"


def _strengths(facts: ReportFacts) -> list[DomainFact]:
    return sorted(
        [d for d in facts.domains if d.skill_score is not None and d.confidence_label in ("moderate", "high")],
        key=lambda d: d.skill_score or 0,
        reverse=True,
    )


def build_progress_summary(facts: ReportFacts) -> dict:
    lines = [
        f"In {facts.period_label}, {facts.student_first_name} completed {facts.activities_completed} activit"
        f"{'y' if facts.activities_completed == 1 else 'ies'} and {facts.assessments_completed} assessment(s), "
        f"earning {facts.xp_earned} XP."
    ]
    if facts.streak_days:
        lines.append(f"Current learning streak: {facts.streak_days} day(s).")
    strong = _strengths(facts)
    if strong:
        top = strong[0]
        lines.append(f"Strongest demonstrated area so far: {top.name} (skill {top.skill_score:.0f}/100, {top.confidence_label} confidence).")
    trend_text = {
        "improving": "Scores on repeated activities are improving.",
        "steady": "Scores on repeated activities are steady.",
        "declining": "Scores on repeated activities dipped recently - a good moment for encouragement and support.",
        "insufficient_data": "There are not yet enough repeated activities to measure a trend.",
    }
    lines.append(trend_text.get(facts.trend_label, trend_text["insufficient_data"]))
    unexplored = [d.name for d in facts.domains if d.evidence_count == 0]
    if unexplored:
        lines.append("Not yet explored: " + ", ".join(unexplored) + ".")
    return {"headline": lines[0], "paragraphs": lines, "source": "engine"}


def build_parent_report(facts: ReportFacts) -> dict:
    summary = build_progress_summary(facts)
    interests = [d.name for d in facts.domains if d.selected]
    sections = [
        {"title": "Overview", "body": " ".join(summary["paragraphs"])},
        {"title": "Chosen interests",
         "body": ("Your child chose: " + ", ".join(interests) + ".") if interests else "No interests selected yet."},
        {"title": "Domain progress", "items": [
            {"domain": d.name, "skill_score": d.skill_score, "progress_score": d.progress_score,
             "confidence": d.confidence_label, "evidence_count": d.evidence_count} for d in facts.domains
        ]},
    ]
    if facts.recent_feedback:
        sections.append({"title": "Mentor feedback", "items": facts.recent_feedback[:5]})
    if facts.achievements:
        sections.append({"title": "Achievements", "items": facts.achievements[:5]})
    sections.append({"title": "How you can help", "body": (
        "Ask about the activities they enjoyed most, celebrate effort as well as results, and encourage them "
        "to try one new domain this month. Scores reflect recorded activities only and are not a measure of intelligence."
    )})
    return {"title": f"{facts.student_first_name}'s progress - {facts.period_label}", "sections": sections, "source": "engine"}


HORIZON_PHASES = {
    7: [("Get started", 1), ("Try a challenge", 4), ("Reflect", 7)],
    30: [("Foundations", 7), ("Practice", 14), ("Mini project", 24), ("Reflect & share", 30)],
    90: [("Foundations", 14), ("Skill building", 35), ("Applied project", 60), ("Advanced challenge", 80), ("Showcase", 90)],
    180: [("Explore", 21), ("Foundations", 45), ("Skill building", 90), ("Major project", 140), ("Validation", 165), ("Showcase", 180)],
}


def build_roadmap(horizon_days: int, domains: list[dict], activities: list[dict], resources: list[dict]) -> dict:
    """Build a roadmap skeleton from real activities/resources.

    ``domains``: [{id, name}], ``activities``: [{id, title, domain_id, difficulty}],
    ``resources``: [{title, url, domain_id}]
    """
    if horizon_days not in HORIZON_PHASES:
        raise ValueError("horizon_days must be one of 7, 30, 90, 180")
    phases = HORIZON_PHASES[horizon_days]
    names = ", ".join(d["name"] for d in domains) or "your chosen domains"
    objectives = [
        f"Build steady habits in {names}.",
        "Complete activities at a level that feels challenging but achievable.",
        "Reflect on what you enjoyed and what you want to try next.",
    ]
    if horizon_days >= 30:
        objectives.append("Finish at least one project and add it to your portfolio.")
    acts = sorted(activities, key=lambda a: a.get("difficulty", 1))
    milestones: list[dict] = []
    per_phase = max(1, len(acts) // max(len(phases), 1)) if acts else 0
    idx = 0
    order = 0
    for phase_title, day in phases:
        chunk = acts[idx: idx + per_phase] if per_phase else []
        idx += per_phase
        for a in chunk:
            milestones.append({"title": a["title"], "kind": "activity", "activity_id": a["id"],
                               "due_day": day, "sort_order": order, "description": f"{phase_title}: complete this activity."})
            order += 1
        milestones.append({"title": f"Milestone: {phase_title}", "kind": "milestone", "due_day": day,
                           "sort_order": order, "description": f"Check in on progress at day {day}."})
        order += 1
    for r in resources[:3]:
        milestones.append({"title": r["title"], "kind": "resource", "resource_url": r.get("url"),
                           "due_day": phases[0][1], "sort_order": order, "description": "Recommended learning resource."})
        order += 1
    if horizon_days >= 30:
        milestones.append({"title": "Portfolio project", "kind": "project", "due_day": phases[-1][1] - 2,
                           "sort_order": order, "description": "Create a project that shows what you learned."})
    milestones.sort(key=lambda m: (m["due_day"], m["sort_order"]))
    for i, m in enumerate(milestones):
        m["sort_order"] = i
    return {"title": f"{horizon_days}-day plan: {names}", "objectives": objectives, "milestones": milestones}
