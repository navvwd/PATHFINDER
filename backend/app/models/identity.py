"""Users, sessions, institutions and organisational structure."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, SoftDelete, TenantScoped, Timestamped, UUIDPk


class Institution(UUIDPk, Timestamped, SoftDelete, Base):
    __tablename__ = "institutions"
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(40), unique=True)
    kind: Mapped[str] = mapped_column(String(40), default="school")
    address: Mapped[str | None] = mapped_column(Text)
    contact_email: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    settings: Mapped[dict[str, Any]] = mapped_column(default=dict)


class Campus(UUIDPk, Timestamped, SoftDelete, Base):
    __tablename__ = "campuses"
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(Text)


class AcademicYear(UUIDPk, Timestamped, Base):
    __tablename__ = "academic_years"
    __table_args__ = (UniqueConstraint("institution_id", "label"),)
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(20))
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)


class SchoolClass(UUIDPk, Timestamped, SoftDelete, Base):
    __tablename__ = "classes"
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id", ondelete="CASCADE"), index=True)
    campus_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campuses.id", ondelete="SET NULL"))
    academic_year_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("academic_years.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(100))
    grade: Mapped[str] = mapped_column(String(20))
    section: Mapped[str | None] = mapped_column(String(20))
    class_teacher_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("mentors.id", ondelete="SET NULL"))


class User(UUIDPk, Timestamped, SoftDelete, TenantScoped, Base):
    __tablename__ = "users"
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(150))
    role: Mapped[str] = mapped_column(String(30), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None]
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None]
    token_version: Mapped[int] = mapped_column(Integer, default=0)  # bump to revoke all access tokens
    preferences: Mapped[dict[str, Any]] = mapped_column(default=dict)

    @property
    def first_name(self) -> str:
        return self.full_name.split(" ")[0]


class UserSession(UUIDPk, Timestamped, Base):
    __tablename__ = "user_sessions"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    client: Mapped[str] = mapped_column(String(20), default="web")
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    last_used_at: Mapped[datetime | None]


class PasswordResetToken(UUIDPk, Timestamped, Base):
    __tablename__ = "password_reset_tokens"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]


class AgeGroup(UUIDPk, Timestamped, Base):
    __tablename__ = "age_groups"
    code: Mapped[str] = mapped_column(String(20), unique=True)
    label: Mapped[str] = mapped_column(String(50))
    min_age: Mapped[int] = mapped_column(Integer)
    max_age: Mapped[int] = mapped_column(Integer)
    ui_mode: Mapped[str] = mapped_column(String(20), default="senior")  # junior | senior
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Student(UUIDPk, Timestamped, SoftDelete, TenantScoped, Base):
    __tablename__ = "students"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    date_of_birth: Mapped[date] = mapped_column(Date)
    age_group_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("age_groups.id", ondelete="SET NULL"), index=True)
    school_name: Mapped[str | None] = mapped_column(String(200))
    grade: Mapped[str | None] = mapped_column(String(20))
    class_name: Mapped[str | None] = mapped_column(String(50))
    educational_background: Mapped[str | None] = mapped_column(Text)
    favourite_subjects: Mapped[list[Any]] = mapped_column(default=list)
    hobbies: Mapped[list[Any]] = mapped_column(default=list)
    personal_interests: Mapped[list[Any]] = mapped_column(default=list)
    extracurriculars: Mapped[list[Any]] = mapped_column(default=list)
    self_reported_strengths: Mapped[list[Any]] = mapped_column(default=list)
    skills_to_learn: Mapped[list[Any]] = mapped_column(default=list)
    activities_enjoyed: Mapped[list[Any]] = mapped_column(default=list)
    aspirations: Mapped[str | None] = mapped_column(Text)
    learning_preferences: Mapped[list[Any]] = mapped_column(default=list)
    onboarding_steps_completed: Mapped[list[Any]] = mapped_column(default=list)
    onboarding_completed_at: Mapped[datetime | None]
    consent_status: Mapped[str] = mapped_column(String(20), default="pending")  # not_required|pending|granted|revoked
    guardian_invite_code: Mapped[str | None] = mapped_column(String(16), unique=True)
    xp: Mapped[int] = mapped_column(Integer, default=0)
    current_streak: Mapped[int] = mapped_column(Integer, default=0)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_active_on: Mapped[date | None] = mapped_column(Date)

    user: Mapped[User] = relationship(lazy="joined")
    age_group: Mapped[AgeGroup | None] = relationship(lazy="joined")


class Guardian(UUIDPk, Timestamped, SoftDelete, Base):
    __tablename__ = "guardians"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    occupation: Mapped[str | None] = mapped_column(String(100))
    user: Mapped[User] = relationship(lazy="joined")


class StudentGuardian(UUIDPk, Timestamped, Base):
    __tablename__ = "student_guardians"
    __table_args__ = (UniqueConstraint("student_id", "guardian_id"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    guardian_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("guardians.id", ondelete="CASCADE"), index=True)
    relationship_type: Mapped[str] = mapped_column(String(30), default="parent")
    status: Mapped[str] = mapped_column(String(20), default="active")  # pending|active|revoked
    is_primary: Mapped[bool] = mapped_column(Boolean, default=True)
    linked_at: Mapped[datetime | None]


class Mentor(UUIDPk, Timestamped, SoftDelete, TenantScoped, Base):
    __tablename__ = "mentors"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    kind: Mapped[str] = mapped_column(String(20), default="mentor")  # mentor | teacher
    expertise_domain_ids: Mapped[list[Any]] = mapped_column(default=list)
    bio: Mapped[str | None] = mapped_column(Text)
    user: Mapped[User] = relationship(lazy="joined")


class Batch(UUIDPk, Timestamped, SoftDelete, TenantScoped, Base):
    __tablename__ = "batches"
    mentor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("mentors.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    domain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("domains.id", ondelete="SET NULL"))


class BatchMember(UUIDPk, Timestamped, Base):
    __tablename__ = "batch_members"
    __table_args__ = (UniqueConstraint("batch_id", "student_id"),)
    batch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("batches.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)


class Enrollment(UUIDPk, Timestamped, Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("student_id", "class_id"),)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    class_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), index=True)
    academic_year_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("academic_years.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(20), default="active")
