from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl

from .common import ORM

# ---------------- progress & scores ----------------


class DomainScoreOut(ORM):
    domain_id: uuid.UUID
    domain_name: str | None = None
    domain_color: str | None = None
    interest_score: float | None
    skill_score: float | None
    progress_score: float | None
    confidence: float
    confidence_label: str
    evidence_count: int
    sufficiently_assessed: bool
    validated_advanced: bool
    dimensions: list[dict[str, Any]]
    explanation: list[str]
    confidence_breakdown: dict[str, Any]
    scoring_config_version: int
    computed_at: datetime


class ProgressEventOut(ORM):
    id: uuid.UUID
    domain_id: uuid.UUID | None
    event_type: str
    source_type: str | None
    source_id: uuid.UUID | None
    evidence_kind: str | None
    score_pct: float | None
    difficulty: int | None
    attempt_no: int | None
    payload: dict[str, Any]
    occurred_at: datetime


class ReflectionIn(BaseModel):
    domain_id: uuid.UUID | None = None
    text: str = Field(min_length=3, max_length=3000)
    mood: Literal["great", "good", "okay", "hard"] | None = None


class WeeklyGoalIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    kind: Literal["activities", "assessments", "custom"] = "activities"
    target_count: int = Field(default=3, ge=1, le=50)


class WeeklyGoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    target_count: int | None = Field(default=None, ge=1, le=50)
    increment: int | None = Field(default=None, ge=-5, le=5)  # for custom goals


class WeeklyGoalOut(ORM):
    id: uuid.UUID
    week_start: date
    title: str
    kind: str
    target_count: int
    current_count: int
    status: str


class ScoringConfigIn(BaseModel):
    weights: dict[str, float]
    thresholds: dict[str, float] = {}
    note: str | None = Field(default=None, max_length=500)


class ScoringConfigOut(ORM):
    id: uuid.UUID
    version: int
    weights: dict[str, Any]
    thresholds: dict[str, Any]
    is_active: bool
    note: str | None
    created_at: datetime


# ---------------- recommendations ----------------

class RecommendationOut(ORM):
    id: uuid.UUID
    run_id: uuid.UUID
    kind: str
    domain_id: uuid.UUID | None
    domain_name: str | None = None
    activity_id: uuid.UUID | None
    title: str
    reasons: list[str]
    evidence: dict[str, Any]
    confidence: float
    priority: int
    status: str
    student_response: str | None
    mentor_review_status: str
    mentor_note: str | None
    generated_by: str
    created_at: datetime


class RecommendationSet(BaseModel):
    status: Literal["ok", "insufficient_data", "not_generated"]
    message: str
    disclaimer: str
    promising_domains: list[uuid.UUID]
    focus_domains: list[uuid.UUID]
    generated_at: datetime | None
    items: list[RecommendationOut]


class RecommendationRespond(BaseModel):
    status: Literal["accepted", "dismissed", "disagreed"]
    response: str | None = Field(default=None, max_length=1000)


class RecommendationReview(BaseModel):
    mentor_review_status: Literal["approved", "adjusted", "rejected"]
    mentor_note: str | None = Field(default=None, max_length=2000)


# ---------------- roadmaps ----------------

class MilestoneOut(ORM):
    id: uuid.UUID
    title: str
    description: str | None
    kind: str
    activity_id: uuid.UUID | None
    resource_url: str | None
    due_day: int
    due_date: date | None = None
    sort_order: int
    status: str
    completed_at: datetime | None
    is_custom: bool


class RoadmapOut(ORM):
    id: uuid.UUID
    student_id: uuid.UUID
    horizon_days: int
    title: str
    objectives: list[str]
    domain_ids: list[uuid.UUID]
    start_date: date
    status: str
    mentor_review_status: str
    mentor_note: str | None
    generated_by: str
    created_at: datetime
    progress_percent: int = 0
    milestones: list[MilestoneOut] = []


class RoadmapGenerate(BaseModel):
    horizon_days: Literal[7, 30, 90, 180]
    domain_ids: list[uuid.UUID] = Field(default_factory=list, max_length=6)
    student_id: uuid.UUID | None = None


class RoadmapUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    objectives: list[str] | None = Field(default=None, max_length=10)
    status: Literal["active", "completed", "archived"] | None = None


class MilestoneIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    due_day: int = Field(default=1, ge=1, le=180)
    resource_url: HttpUrl | None = None


class MilestoneUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    due_day: int | None = Field(default=None, ge=1, le=180)
    status: Literal["pending", "done", "skipped"] | None = None
    sort_order: int | None = Field(default=None, ge=0)


class RoadmapReview(BaseModel):
    mentor_review_status: Literal["approved", "adjusted", "rejected"]
    mentor_note: str | None = Field(default=None, max_length=2000)


# ---------------- portfolio ----------------

PortfolioCategory = Literal["image", "video", "document", "presentation", "coding_project", "research_project",
                            "creative_work", "certificate", "achievement"]


class PortfolioItemIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: PortfolioCategory
    domain_ids: list[uuid.UUID] = Field(default_factory=list, max_length=6)
    file_id: uuid.UUID | None = None
    external_url: HttpUrl | None = None
    submission_id: uuid.UUID | None = None
    created_on: date | None = None
    is_featured: bool = False


class PortfolioItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: PortfolioCategory | None = None
    domain_ids: list[uuid.UUID] | None = None
    is_featured: bool | None = None


class PortfolioItemOut(ORM):
    id: uuid.UUID
    title: str
    description: str | None
    category: str
    domain_ids: list[uuid.UUID]
    file_id: uuid.UUID | None
    file_name: str | None = None
    file_content_type: str | None = None
    external_url: str | None
    submission_id: uuid.UUID | None
    created_on: date
    is_featured: bool
    mentor_feedback: str | None
    created_at: datetime


class PortfolioOut(ORM):
    id: uuid.UUID
    student_id: uuid.UUID
    student_name: str | None = None
    title: str
    bio: str | None
    visibility: str
    share_token: str | None
    guardian_approved_sharing: bool
    sharing_requires_guardian: bool = False
    items: list[PortfolioItemOut] = []


class PortfolioUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    bio: str | None = Field(default=None, max_length=2000)
    visibility: Literal["private", "guardians", "mentors", "link"] | None = None


# ---------------- gamification ----------------

class AchievementOut(ORM):
    id: uuid.UUID
    code: str
    title: str
    description: str
    icon: str
    category: str
    xp_reward: int
    earned: bool = False
    awarded_at: datetime | None = None


class GamificationOut(BaseModel):
    xp: int
    level: int
    xp_into_level: int
    xp_for_next_level: int
    current_streak: int
    longest_streak: int
    achievements: list[AchievementOut]
    recent_xp: list[dict[str, Any]]
    weekly_goals: list[WeeklyGoalOut]


# ---------------- notifications / messages ----------------

class NotificationOut(ORM):
    id: uuid.UUID
    kind: str
    title: str
    body: str | None
    link: str | None
    read_at: datetime | None
    created_at: datetime


class NotificationPrefs(BaseModel):
    email: bool = True
    push: bool = True
    weekly_digest: bool = True
    activity_reminders: bool = True
    mentor_feedback: bool = True


class BroadcastIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=2, max_length=2000)
    roles: list[str] = Field(default_factory=list)
    institution_id: uuid.UUID | None = None
    link: str | None = Field(default=None, max_length=300)


class MessageIn(BaseModel):
    student_id: uuid.UUID
    recipient_id: uuid.UUID
    body: str = Field(min_length=1, max_length=4000)


class MessageOut(ORM):
    id: uuid.UUID
    student_id: uuid.UUID
    sender_id: uuid.UUID
    sender_name: str | None = None
    recipient_id: uuid.UUID
    body: str
    read_at: datetime | None
    created_at: datetime


class MentorFeedbackIn(BaseModel):
    content: str = Field(min_length=2, max_length=5000)
    kind: Literal["feedback", "observation"] = "feedback"
    domain_id: uuid.UUID | None = None
    submission_id: uuid.UUID | None = None
    visible_to_guardian: bool = True
    visible_to_student: bool = True


class MentorFeedbackOut(ORM):
    id: uuid.UUID
    mentor_user_id: uuid.UUID
    mentor_name: str | None = None
    student_id: uuid.UUID
    domain_id: uuid.UUID | None
    submission_id: uuid.UUID | None
    kind: str
    content: str
    visible_to_guardian: bool
    visible_to_student: bool
    created_at: datetime


# ---------------- reports ----------------

class ReportGenerate(BaseModel):
    student_id: uuid.UUID | None = None
    kind: Literal["weekly", "monthly", "progress", "parent"] = "weekly"


class ReportOut(ORM):
    id: uuid.UUID
    student_id: uuid.UUID | None
    institution_id: uuid.UUID | None
    kind: str
    period_start: date
    period_end: date
    title: str
    content: dict[str, Any]
    generated_by: str
    is_demo: bool
    created_at: datetime
