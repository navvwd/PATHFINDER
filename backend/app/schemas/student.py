from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from .common import ORM

TagList = list[str]


def _clean_tags(v: list[str] | None) -> list[str]:
    if not v:
        return []
    out: list[str] = []
    for t in v:
        t = " ".join(str(t).split())[:60]
        if t and t.lower() not in {x.lower() for x in out}:
            out.append(t)
    return out[:20]


class AgeGroupOut(ORM):
    id: uuid.UUID
    code: str
    label: str
    min_age: int
    max_age: int
    ui_mode: str


class StudentOut(ORM):
    id: uuid.UUID
    user_id: uuid.UUID
    full_name: str
    email: str | None = None
    date_of_birth: date
    age: int
    age_group: AgeGroupOut | None
    institution_id: uuid.UUID | None
    school_name: str | None
    grade: str | None
    class_name: str | None
    educational_background: str | None
    favourite_subjects: list[str]
    hobbies: list[str]
    personal_interests: list[str]
    extracurriculars: list[str]
    self_reported_strengths: list[str]
    skills_to_learn: list[str]
    activities_enjoyed: list[str]
    aspirations: str | None
    learning_preferences: list[str]
    onboarding_steps_completed: list[str]
    onboarding_completed_at: datetime | None
    consent_status: str
    xp: int
    current_streak: int
    longest_streak: int
    created_at: datetime


class StudentSummary(ORM):
    id: uuid.UUID
    full_name: str
    age: int
    age_group: str | None
    grade: str | None
    school_name: str | None
    xp: int
    current_streak: int
    institution_id: uuid.UUID | None
    onboarding_complete: bool


class AcademicProfileIn(BaseModel):
    school_name: str = Field(min_length=1, max_length=200)
    grade: str = Field(min_length=1, max_length=20)
    class_name: str | None = Field(default=None, max_length=50)
    educational_background: str | None = Field(default=None, max_length=1000)


class InterestProfileIn(BaseModel):
    favourite_subjects: TagList = []
    hobbies: TagList = []
    personal_interests: TagList = []
    extracurriculars: TagList = []
    self_reported_strengths: TagList = []
    domain_ids: list[uuid.UUID] = Field(default_factory=list, max_length=6)
    subdomain_ids: list[uuid.UUID] = Field(default_factory=list, max_length=48)
    favourite_domain_id: uuid.UUID | None = None

    @field_validator("favourite_subjects", "hobbies", "personal_interests", "extracurriculars",
                     "self_reported_strengths")
    @classmethod
    def _clean(cls, v):
        return _clean_tags(v)


class GoalsIn(BaseModel):
    skills_to_learn: TagList = []
    activities_enjoyed: TagList = []
    aspirations: str | None = Field(default=None, max_length=1000)
    learning_preferences: TagList = []

    @field_validator("skills_to_learn", "activities_enjoyed", "learning_preferences")
    @classmethod
    def _clean(cls, v):
        return _clean_tags(v)


class GuardianStepIn(BaseModel):
    action: Literal["invite", "skip_adult"] = "invite"


class OnboardingStep(BaseModel):
    key: str
    title: str
    completed: bool
    required: bool


class OnboardingStatus(BaseModel):
    steps: list[OnboardingStep]
    percent_complete: int
    completed: bool
    guardian_invite_code: str | None
    consent_status: str
    requires_guardian_consent: bool


class StudentProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    school_name: str | None = Field(default=None, max_length=200)
    grade: str | None = Field(default=None, max_length=20)
    class_name: str | None = Field(default=None, max_length=50)
    educational_background: str | None = Field(default=None, max_length=1000)
    favourite_subjects: TagList | None = None
    hobbies: TagList | None = None
    personal_interests: TagList | None = None
    extracurriculars: TagList | None = None
    self_reported_strengths: TagList | None = None
    skills_to_learn: TagList | None = None
    activities_enjoyed: TagList | None = None
    aspirations: str | None = Field(default=None, max_length=1000)
    learning_preferences: TagList | None = None

    @field_validator("favourite_subjects", "hobbies", "personal_interests", "extracurriculars",
                     "self_reported_strengths", "skills_to_learn", "activities_enjoyed", "learning_preferences")
    @classmethod
    def _tags(cls, v):
        return None if v is None else _clean_tags(v)


class DashboardOut(BaseModel):
    student: StudentSummary
    greeting: str
    ui_mode: str
    selected_domains: list[dict[str, Any]]
    daily_activities: list[dict[str, Any]]
    pending_challenges: list[dict[str, Any]]
    recent_achievements: list[dict[str, Any]]
    progress_chart: list[dict[str, Any]]
    weekly_goals: list[dict[str, Any]]
    portfolio_highlights: list[dict[str, Any]]
    recommendations: list[dict[str, Any]]
    milestones: list[dict[str, Any]]
    stats: dict[str, Any]
