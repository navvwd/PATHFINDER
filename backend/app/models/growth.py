"""Progress, scoring, recommendations, roadmaps, portfolio and gamification."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, SoftDelete, Timestamped, UUIDPk, utcnow


class ProgressEvent(UUIDPk, Base):
    """Append-only event stream. Every measurable thing a student does lands here."""

    __tablename__ = "progress_events"
    __table_args__ = (
        Index("ix_progress_events_student_time", "student_id", "occurred_at"),
        Index("ix_progress_events_student_domain", "student_id", "domain_id"),
    )
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    domain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("domains.id", ondelete="SET NULL"))
    subdomain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subdomains.id", ondelete="SET NULL"))
    # activity_completed|assessment_completed|project_submitted|mentor_feedback|reflection|milestone_reached|
    # difficulty_changed|domain_explored|xp_awarded|achievement_unlocked
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    source_type: Mapped[str | None] = mapped_column(String(40))
    source_id: Mapped[uuid.UUID | None]
    evidence_kind: Mapped[str | None] = mapped_column(String(30))  # activity|assessment|project|mentor_observation
    category: Mapped[str | None] = mapped_column(String(40))
    score_pct: Mapped[float | None] = mapped_column(Float)
    scale_key: Mapped[str | None] = mapped_column(String(80))
    difficulty: Mapped[int | None] = mapped_column(Integer)
    attempt_no: Mapped[int | None] = mapped_column(Integer)
    mentor_validated: Mapped[bool] = mapped_column(Boolean, default=False)
    evidence_quality: Mapped[float | None] = mapped_column(Float)
    dimension_scores: Mapped[dict[str, Any]] = mapped_column(default=dict)
    payload: Mapped[dict[str, Any]] = mapped_column(default=dict)
    is_superseded: Mapped[bool] = mapped_column(Boolean, default=False)  # re-evaluation keeps the old row
    occurred_at: Mapped[datetime] = mapped_column(default=utcnow)


class ProgressSnapshot(UUIDPk, Timestamped, Base):
    __tablename__ = "progress_snapshots"
    __table_args__ = (UniqueConstraint("student_id", "period", "period_start"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    period: Mapped[str] = mapped_column(String(10))  # daily|weekly|monthly
    period_start: Mapped[date] = mapped_column(Date)
    metrics: Mapped[dict[str, Any]] = mapped_column(default=dict)


class ScoringConfigVersion(UUIDPk, Base):
    __tablename__ = "scoring_configs"
    version: Mapped[int] = mapped_column(Integer, unique=True)
    weights: Mapped[dict[str, Any]] = mapped_column(default=dict)
    thresholds: Mapped[dict[str, Any]] = mapped_column(default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class DomainScore(UUIDPk, Base):
    """Historical score snapshots - a new row per computation, never overwritten."""

    __tablename__ = "domain_scores"
    __table_args__ = (Index("ix_domain_scores_student_domain_time", "student_id", "domain_id", "computed_at"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    domain_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("domains.id", ondelete="CASCADE"))
    interest_score: Mapped[float | None] = mapped_column(Float)
    skill_score: Mapped[float | None] = mapped_column(Float)
    progress_score: Mapped[float | None] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    confidence_label: Mapped[str] = mapped_column(String(10), default="none")
    evidence_count: Mapped[int] = mapped_column(Integer, default=0)
    sufficiently_assessed: Mapped[bool] = mapped_column(Boolean, default=False)
    validated_advanced: Mapped[bool] = mapped_column(Boolean, default=False)
    dimensions: Mapped[list[Any]] = mapped_column(default=list)
    explanation: Mapped[list[Any]] = mapped_column(default=list)
    confidence_breakdown: Mapped[dict[str, Any]] = mapped_column(default=dict)
    scoring_config_version: Mapped[int] = mapped_column(Integer, default=1)
    computed_at: Mapped[datetime] = mapped_column(default=utcnow)


class Recommendation(UUIDPk, Timestamped, Base):
    __tablename__ = "recommendations"
    __table_args__ = (Index("ix_recommendations_student_status", "student_id", "status"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    run_id: Mapped[uuid.UUID] = mapped_column(index=True)  # one engine run = one batch
    kind: Mapped[str] = mapped_column(String(30))
    domain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("domains.id", ondelete="CASCADE"))
    activity_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("activities.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(250))
    reasons: Mapped[list[Any]] = mapped_column(default=list)
    evidence: Mapped[dict[str, Any]] = mapped_column(default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    priority: Mapped[int] = mapped_column(Integer, default=50)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|accepted|dismissed|disagreed|superseded
    student_response: Mapped[str | None] = mapped_column(Text)
    mentor_review_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|approved|adjusted|rejected
    mentor_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    generated_by: Mapped[str] = mapped_column(String(20), default="engine")


class Roadmap(UUIDPk, Timestamped, SoftDelete, Base):
    __tablename__ = "roadmaps"
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    horizon_days: Mapped[int] = mapped_column(Integer)  # 7|30|90|180
    title: Mapped[str] = mapped_column(String(200))
    objectives: Mapped[list[Any]] = mapped_column(default=list)
    domain_ids: Mapped[list[Any]] = mapped_column(default=list)
    start_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|completed|archived
    mentor_review_status: Mapped[str] = mapped_column(String(20), default="pending")
    mentor_note: Mapped[str | None] = mapped_column(Text)
    generated_by: Mapped[str] = mapped_column(String(20), default="engine")
    milestones: Mapped[list[RoadmapMilestone]] = relationship(
        back_populates="roadmap", order_by="RoadmapMilestone.sort_order", cascade="all, delete-orphan"
    )


class RoadmapMilestone(UUIDPk, Timestamped, Base):
    __tablename__ = "roadmap_milestones"
    roadmap_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roadmaps.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20), default="milestone")  # activity|project|resource|milestone|custom
    activity_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("activities.id", ondelete="SET NULL"))
    resource_url: Mapped[str | None] = mapped_column(String(500))
    due_day: Mapped[int] = mapped_column(Integer, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|done|skipped
    completed_at: Mapped[datetime | None]
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    roadmap: Mapped[Roadmap] = relationship(back_populates="milestones")


class Portfolio(UUIDPk, Timestamped, Base):
    __tablename__ = "portfolios"
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), unique=True)
    title: Mapped[str] = mapped_column(String(200), default="My Portfolio")
    bio: Mapped[str | None] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(20), default="private")  # private|guardians|mentors|link
    share_token: Mapped[str | None] = mapped_column(String(64), unique=True)
    guardian_approved_sharing: Mapped[bool] = mapped_column(Boolean, default=False)
    items: Mapped[list[PortfolioItem]] = relationship(back_populates="portfolio", cascade="all, delete-orphan")


class PortfolioItem(UUIDPk, Timestamped, SoftDelete, Base):
    __tablename__ = "portfolio_items"
    portfolio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    # image|video|document|presentation|coding_project|research_project|creative_work|certificate|achievement
    category: Mapped[str] = mapped_column(String(30))
    domain_ids: Mapped[list[Any]] = mapped_column(default=list)
    file_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("stored_files.id", ondelete="SET NULL"))
    external_url: Mapped[str | None] = mapped_column(String(500))
    submission_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("submissions.id", ondelete="SET NULL"))
    created_on: Mapped[date] = mapped_column(Date)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    mentor_feedback: Mapped[str | None] = mapped_column(Text)
    portfolio: Mapped[Portfolio] = relationship(back_populates="items")


class Achievement(UUIDPk, Timestamped, Base):
    __tablename__ = "achievements"
    code: Mapped[str] = mapped_column(String(60), unique=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    icon: Mapped[str] = mapped_column(String(40), default="award")
    category: Mapped[str] = mapped_column(String(30))  # streak|milestone|exploration|project|goal
    xp_reward: Mapped[int] = mapped_column(Integer, default=50)
    criteria: Mapped[dict[str, Any]] = mapped_column(default=dict)


class StudentAchievement(UUIDPk, Base):
    __tablename__ = "student_achievements"
    __table_args__ = (UniqueConstraint("student_id", "achievement_id"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    achievement_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("achievements.id", ondelete="CASCADE"))
    awarded_at: Mapped[datetime] = mapped_column(default=utcnow)
    context: Mapped[dict[str, Any]] = mapped_column(default=dict)
    achievement: Mapped[Achievement] = relationship(lazy="joined")


class XPTransaction(UUIDPk, Base):
    __tablename__ = "xp_transactions"
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(120))
    source_type: Mapped[str | None] = mapped_column(String(40))
    source_id: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class WeeklyGoal(UUIDPk, Timestamped, Base):
    __tablename__ = "weekly_goals"
    __table_args__ = (Index("ix_weekly_goals_student_week", "student_id", "week_start"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    week_start: Mapped[date] = mapped_column(Date)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30), default="activities")  # activities|assessments|minutes|custom
    target_count: Mapped[int] = mapped_column(Integer, default=3)
    current_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|completed|missed
