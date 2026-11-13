"""Feedback, communication, reports, consent, subscriptions and platform admin."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, Timestamped, UUIDPk, utcnow


class MentorFeedback(UUIDPk, Timestamped, Base):
    __tablename__ = "mentor_feedback"
    __table_args__ = (Index("ix_mentor_feedback_student_time", "student_id", "created_at"),)
    mentor_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    domain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("domains.id", ondelete="SET NULL"))
    submission_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("submissions.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(30), default="feedback")  # feedback|observation|recommendation_review
    content: Mapped[str] = mapped_column(Text)
    visible_to_guardian: Mapped[bool] = mapped_column(Boolean, default=True)
    visible_to_student: Mapped[bool] = mapped_column(Boolean, default=True)


class Notification(UUIDPk, Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read", "user_id", "read_at"),)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))
    read_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Message(UUIDPk, Base):
    """Parent <-> mentor communication about a specific student."""

    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_student_time", "student_id", "created_at"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    sender_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    recipient_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    read_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Report(UUIDPk, Timestamped, Base):
    __tablename__ = "reports"
    student_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    institution_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # weekly|monthly|parent|progress|institution
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[dict[str, Any]] = mapped_column(default=dict)
    generated_by: Mapped[str] = mapped_column(String(20), default="engine")  # engine|ai|demo
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class SubscriptionPlan(UUIDPk, Timestamped, Base):
    __tablename__ = "subscription_plans"
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    max_students: Mapped[int] = mapped_column(Integer, default=100)
    price_inr_per_year: Mapped[int] = mapped_column(Integer, default=0)
    features: Mapped[dict[str, Any]] = mapped_column(default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Subscription(UUIDPk, Timestamped, Base):
    __tablename__ = "subscriptions"
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    plan_code: Mapped[str] = mapped_column(ForeignKey("subscription_plans.code", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(20), default="active")  # trial|active|past_due|cancelled
    seats: Mapped[int] = mapped_column(Integer, default=100)
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date | None] = mapped_column(Date)


class ConsentRecord(UUIDPk, Base):
    """Append-only consent ledger (DPDP Act: verifiable guardian consent)."""

    __tablename__ = "consent_records"
    __table_args__ = (Index("ix_consent_records_student_type", "student_id", "consent_type"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    guardian_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("guardians.id", ondelete="SET NULL"))
    granted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # data_processing|ai_processing|portfolio_sharing|communications|mentor_access
    consent_type: Mapped[str] = mapped_column(String(30))
    granted: Mapped[bool] = mapped_column(Boolean)
    policy_version: Mapped[str] = mapped_column(String(20), default="2026-01")
    method: Mapped[str] = mapped_column(String(30), default="guardian_portal")
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class AuditLog(UUIDPk, Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_time", "created_at"), Index("ix_audit_logs_entity", "entity_type", "entity_id"))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(80))
    category: Mapped[str] = mapped_column(String(20), default="data")  # data|security|admin|ai
    entity_type: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    institution_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("institutions.id", ondelete="SET NULL"))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    details: Mapped[dict[str, Any]] = mapped_column(default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class FeatureFlag(UUIDPk, Timestamped, Base):
    __tablename__ = "feature_flags"
    key: Mapped[str] = mapped_column(String(60), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(Text)
    rules: Mapped[dict[str, Any]] = mapped_column(default=dict)


class SystemSetting(Timestamped, Base):
    __tablename__ = "system_settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(default=dict)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class AIUsageLog(UUIDPk, Base):
    """Token/latency tracking. Stores no prompt or response content."""

    __tablename__ = "ai_usage_logs"
    __table_args__ = (Index("ix_ai_usage_logs_time", "created_at"),)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    feature: Mapped[str] = mapped_column(String(40))
    provider: Mapped[str] = mapped_column(String(30))
    model: Mapped[str | None] = mapped_column(String(80))
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20))  # ok|fallback|error|rate_limited|invalid_output
    error_code: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class LiveSession(UUIDPk, Timestamped, Base):
    """A scheduled live (online or in-person) session run by a mentor/teacher."""

    __tablename__ = "live_sessions"
    __table_args__ = (Index("ix_live_sessions_starts", "starts_at"),)
    mentor_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    institution_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("institutions.id", ondelete="SET NULL"), index=True)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("batches.id", ondelete="SET NULL"), index=True)
    domain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("domains.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    starts_at: Mapped[datetime]
    duration_minutes: Mapped[int] = mapped_column(Integer, default=45)
    meeting_url: Mapped[str | None] = mapped_column(String(500))
    location: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="scheduled")  # scheduled|cancelled|completed


class SessionParticipant(UUIDPk, Timestamped, Base):
    """Invitation + attendance record for one student in one session."""

    __tablename__ = "session_participants"
    __table_args__ = (UniqueConstraint("session_id", "student_id"),)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("live_sessions.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    attendance: Mapped[str] = mapped_column(String(20), default="pending")  # pending|present|late|absent|excused
    marked_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    marked_at: Mapped[datetime | None]
