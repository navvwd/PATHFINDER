"""Domains, interests, activities, assessments, submissions and evaluation."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, JSONType, SoftDelete, TenantScoped, Timestamped, UUIDPk, utcnow


class Domain(UUIDPk, Timestamped, SoftDelete, Base):
    __tablename__ = "domains"
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    tagline: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    advantages: Mapped[list[Any]] = mapped_column(default=list)
    skill_categories: Mapped[list[Any]] = mapped_column(default=list)
    roadmap_template: Mapped[list[Any]] = mapped_column(default=list)  # ordered stage descriptions
    icon: Mapped[str] = mapped_column(String(40), default="compass")
    color: Mapped[str] = mapped_column(String(20), default="#6366f1")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    subdomains: Mapped[list[Subdomain]] = relationship(
        back_populates="domain", order_by="Subdomain.sort_order", cascade="all, delete-orphan"
    )


class Subdomain(UUIDPk, Timestamped, SoftDelete, Base):
    __tablename__ = "subdomains"
    __table_args__ = (UniqueConstraint("domain_id", "slug"),)
    domain_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("domains.id", ondelete="CASCADE"), index=True)
    slug: Mapped[str] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    skill_categories: Mapped[list[Any]] = mapped_column(default=list)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    domain: Mapped[Domain] = relationship(back_populates="subdomains")


class LearningResource(UUIDPk, Timestamped, SoftDelete, Base):
    __tablename__ = "learning_resources"
    domain_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("domains.id", ondelete="CASCADE"), index=True)
    subdomain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subdomains.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200))
    url: Mapped[str | None] = mapped_column(String(500))
    kind: Mapped[str] = mapped_column(String(30), default="article")  # article|video|course|book|tool
    min_age: Mapped[int] = mapped_column(Integer, default=6)
    max_age: Mapped[int] = mapped_column(Integer, default=21)
    description: Mapped[str | None] = mapped_column(Text)


class StudentInterest(UUIDPk, Timestamped, Base):
    """Current interest selections (preference only)."""

    __tablename__ = "student_interests"
    __table_args__ = (UniqueConstraint("student_id", "domain_id", "subdomain_id"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    domain_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("domains.id", ondelete="CASCADE"), index=True)
    subdomain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subdomains.id", ondelete="CASCADE"))
    strength: Mapped[int] = mapped_column(Integer, default=3)  # 1..5
    is_favourite: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(30), default="self")  # onboarding|questionnaire|self|exploration
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class InterestHistory(UUIDPk, Base):
    """Append-only log powering the Interest Evolution Tracker."""

    __tablename__ = "interest_history"
    __table_args__ = (Index("ix_interest_history_student_time", "student_id", "created_at"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    domain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("domains.id", ondelete="CASCADE"))
    subdomain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subdomains.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(30))  # added|removed|strength_changed|favourited|unfavourited|explored|questionnaire
    old_value: Mapped[dict[str, Any] | None] = mapped_column(default=None)
    new_value: Mapped[dict[str, Any] | None] = mapped_column(default=None)
    source: Mapped[str] = mapped_column(String(30), default="self")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class EvaluationRubric(UUIDPk, Timestamped, SoftDelete, TenantScoped, Base):
    __tablename__ = "evaluation_rubrics"
    title: Mapped[str] = mapped_column(String(200))
    domain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("domains.id", ondelete="SET NULL"))
    # [{key, label, description, max_points, dimension}] - dimension feeds the scoring engine
    criteria: Mapped[list[Any]] = mapped_column(default=list)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    @property
    def max_points(self) -> float:
        return float(sum(c.get("max_points", 0) for c in self.criteria))


class Activity(UUIDPk, Timestamped, SoftDelete, TenantScoped, Base):
    __tablename__ = "activities"
    __table_args__ = (Index("ix_activities_domain_status", "domain_id", "status"),)
    title: Mapped[str] = mapped_column(String(200))
    domain_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("domains.id", ondelete="RESTRICT"))
    subdomain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subdomains.id", ondelete="SET NULL"), index=True)
    category: Mapped[str] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(Text)
    min_age: Mapped[int] = mapped_column(Integer, default=6)
    max_age: Mapped[int] = mapped_column(Integer, default=21)
    difficulty: Mapped[int] = mapped_column(Integer, default=1)  # 1..5
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=30)
    instructions: Mapped[str] = mapped_column(Text)
    evaluation_criteria: Mapped[list[Any]] = mapped_column(default=list)
    submission_type: Mapped[str] = mapped_column(String(20), default="text")  # text|file|link|mixed|none
    max_score: Mapped[float] = mapped_column(Float, default=100)
    status: Mapped[str] = mapped_column(String(20), default="published")  # draft|published|archived
    is_team: Mapped[bool] = mapped_column(Boolean, default=False)
    xp_reward: Mapped[int] = mapped_column(Integer, default=20)
    rubric_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("evaluation_rubrics.id", ondelete="SET NULL"))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    domain: Mapped[Domain] = relationship(lazy="joined")
    subdomain: Mapped[Subdomain | None] = relationship(lazy="joined")
    rubric: Mapped[EvaluationRubric | None] = relationship(lazy="joined")


class ActivityAssignment(UUIDPk, Timestamped, Base):
    __tablename__ = "activity_assignments"
    __table_args__ = (UniqueConstraint("activity_id", "student_id"),)
    activity_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("batches.id", ondelete="SET NULL"))
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    due_at: Mapped[datetime | None]
    status: Mapped[str] = mapped_column(String(20), default="assigned")  # assigned|in_progress|submitted|completed
    is_voluntary: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str | None] = mapped_column(Text)
    activity: Mapped[Activity] = relationship(lazy="joined")


class StoredFile(UUIDPk, Timestamped, SoftDelete, Base):
    __tablename__ = "stored_files"
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    storage_key: Mapped[str] = mapped_column(String(300), unique=True)
    original_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))


class Submission(UUIDPk, Timestamped, Base):
    __tablename__ = "submissions"
    __table_args__ = (Index("ix_submissions_student_activity", "student_id", "activity_id"),)
    activity_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"))
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("activity_assignments.id", ondelete="SET NULL"))
    attempt_no: Mapped[int] = mapped_column(Integer, default=1)
    content_text: Mapped[str | None] = mapped_column(Text)
    link_url: Mapped[str | None] = mapped_column(String(500))
    file_ids: Mapped[list[Any]] = mapped_column(default=list)
    reflection: Mapped[str | None] = mapped_column(Text)
    self_rating: Mapped[int | None] = mapped_column(Integer)  # 1..5 enjoyment
    status: Mapped[str] = mapped_column(String(20), default="submitted")  # submitted|evaluated|returned
    submitted_at: Mapped[datetime] = mapped_column(default=utcnow)
    activity: Mapped[Activity] = relationship(lazy="joined")


class Assessment(UUIDPk, Timestamped, SoftDelete, TenantScoped, Base):
    __tablename__ = "assessments"
    title: Mapped[str] = mapped_column(String(200))
    domain_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("domains.id", ondelete="RESTRICT"), index=True)
    subdomain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subdomains.id", ondelete="SET NULL"))
    type: Mapped[str] = mapped_column(String(30))  # multiple_choice|logical_reasoning|scenario|creative_response|...
    description: Mapped[str | None] = mapped_column(Text)
    min_age: Mapped[int] = mapped_column(Integer, default=6)
    max_age: Mapped[int] = mapped_column(Integer, default=21)
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    time_limit_minutes: Mapped[int | None] = mapped_column(Integer)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    randomize_questions: Mapped[bool] = mapped_column(Boolean, default=True)
    questions_per_attempt: Mapped[int | None] = mapped_column(Integer)
    scale_key: Mapped[str] = mapped_column(String(80))  # comparability group for progress
    status: Mapped[str] = mapped_column(String(20), default="published")
    rubric_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("evaluation_rubrics.id", ondelete="SET NULL"))
    xp_reward: Mapped[int] = mapped_column(Integer, default=30)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    questions: Mapped[list[Question]] = relationship(back_populates="assessment", order_by="Question.sort_order",
                                                      cascade="all, delete-orphan")
    domain: Mapped[Domain] = relationship(lazy="joined")


class Question(UUIDPk, Timestamped, Base):
    """Question bank item. ``correct_answer`` is never serialised to students."""

    __tablename__ = "questions"
    assessment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(20))  # mcq|multi_select|numeric|short_text|long_text|rating
    prompt: Mapped[str] = mapped_column(Text)
    options: Mapped[list[Any]] = mapped_column(default=list)  # [{key, label}]
    correct_answer: Mapped[Any | None] = mapped_column(JSONType, default=None)
    points: Mapped[float] = mapped_column(Float, default=1)
    explanation: Mapped[str | None] = mapped_column(Text)
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    assessment: Mapped[Assessment] = relationship(back_populates="questions")

    @property
    def auto_gradable(self) -> bool:
        return self.type in ("mcq", "multi_select", "numeric") and self.correct_answer is not None


class AssessmentAttempt(UUIDPk, Timestamped, Base):
    __tablename__ = "assessment_attempts"
    __table_args__ = (UniqueConstraint("assessment_id", "student_id", "attempt_no"),)
    assessment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assessments.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    attempt_no: Mapped[int] = mapped_column(Integer)
    question_ids: Mapped[list[Any]] = mapped_column(default=list)  # randomised order served
    started_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime | None]
    submitted_at: Mapped[datetime | None]
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # in_progress|pending_review|evaluated|expired
    raw_score: Mapped[float | None] = mapped_column(Float)
    max_score: Mapped[float | None] = mapped_column(Float)
    normalized_score: Mapped[float | None] = mapped_column(Float)
    assessment: Mapped[Assessment] = relationship(lazy="joined")
    responses: Mapped[list[AssessmentResponse]] = relationship(back_populates="attempt", cascade="all, delete-orphan")


class AssessmentResponse(UUIDPk, Timestamped, Base):
    __tablename__ = "assessment_responses"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id"),)
    attempt_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assessment_attempts.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions.id", ondelete="CASCADE"))
    answer: Mapped[Any | None] = mapped_column(JSONType, default=None)
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    points_awarded: Mapped[float | None] = mapped_column(Float)
    feedback: Mapped[str | None] = mapped_column(Text)
    attempt: Mapped[AssessmentAttempt] = relationship(back_populates="responses")


class EvaluationRecord(UUIDPk, Timestamped, Base):
    """Immutable evaluation. Re-evaluation creates a new record (history kept)."""

    __tablename__ = "evaluation_records"
    submission_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("submissions.id", ondelete="CASCADE"), index=True)
    attempt_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assessment_attempts.id", ondelete="CASCADE"), index=True)
    evaluator_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    rubric_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("evaluation_rubrics.id", ondelete="SET NULL"))
    criteria_scores: Mapped[dict[str, Any]] = mapped_column(default=dict)
    dimension_scores: Mapped[dict[str, Any]] = mapped_column(default=dict)  # 0..100 per scoring dimension
    total_score: Mapped[float] = mapped_column(Float)
    max_score: Mapped[float] = mapped_column(Float)
    normalized_score: Mapped[float] = mapped_column(Float)
    evidence_quality: Mapped[float] = mapped_column(Float, default=0.5)
    feedback: Mapped[str | None] = mapped_column(Text)
    is_auto: Mapped[bool] = mapped_column(Boolean, default=False)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
