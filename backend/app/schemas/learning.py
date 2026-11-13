from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

from .common import ORM

ActivityCategory = Literal[
    "knowledge_quiz", "logical_puzzle", "creative_assignment", "coding_challenge", "science_experiment",
    "business_simulation", "public_speaking", "research_task", "practical_project", "team_challenge",
]
AssessmentType = Literal[
    "multiple_choice", "logical_reasoning", "scenario", "creative_response", "practical_execution",
    "project_based", "self_reflection", "mentor_evaluation", "presentation", "research",
]
QuestionType = Literal["mcq", "multi_select", "numeric", "short_text", "long_text", "rating"]
SubmissionType = Literal["text", "file", "link", "mixed", "none"]
Dimension = Literal["performance", "problem_solving", "creativity", "adaptability", "consistency", "engagement",
                    "learning_progress"]


# ---------------- domains ----------------

class SubdomainOut(ORM):
    id: uuid.UUID
    domain_id: uuid.UUID
    slug: str
    name: str
    description: str | None
    skill_categories: list[str]
    sort_order: int


class DomainOut(ORM):
    id: uuid.UUID
    slug: str
    name: str
    tagline: str | None
    description: str
    advantages: list[str]
    skill_categories: list[str]
    roadmap_template: list[dict[str, Any]]
    icon: str
    color: str
    sort_order: int
    is_active: bool
    subdomains: list[SubdomainOut] = []


class ResourceOut(ORM):
    id: uuid.UUID
    domain_id: uuid.UUID
    subdomain_id: uuid.UUID | None
    title: str
    url: str | None
    kind: str
    description: str | None
    min_age: int
    max_age: int


class DomainDetail(DomainOut):
    resources: list[ResourceOut] = []
    activity_counts: dict[str, int] = {}
    assessment_count: int = 0
    project_count: int = 0
    challenge_count: int = 0


class DomainIn(BaseModel):
    slug: str = Field(pattern=r"^[a-z0-9-]{2,60}$")
    name: str = Field(min_length=2, max_length=120)
    tagline: str | None = Field(default=None, max_length=200)
    description: str = Field(min_length=10, max_length=5000)
    advantages: list[str] = []
    skill_categories: list[str] = []
    roadmap_template: list[dict[str, Any]] = []
    icon: str = Field(default="compass", max_length=40)
    color: str = Field(default="#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")
    sort_order: int = 0


class DomainUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    tagline: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, min_length=10, max_length=5000)
    advantages: list[str] | None = None
    skill_categories: list[str] | None = None
    roadmap_template: list[dict[str, Any]] | None = None
    icon: str | None = Field(default=None, max_length=40)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    sort_order: int | None = None
    is_active: bool | None = None


class SubdomainIn(BaseModel):
    domain_id: uuid.UUID
    slug: str = Field(pattern=r"^[a-z0-9-]{2,60}$")
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=3000)
    skill_categories: list[str] = []
    sort_order: int = 0


class SubdomainUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=3000)
    skill_categories: list[str] | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class ResourceIn(BaseModel):
    domain_id: uuid.UUID
    subdomain_id: uuid.UUID | None = None
    title: str = Field(min_length=2, max_length=200)
    url: HttpUrl | None = None
    kind: Literal["article", "video", "course", "book", "tool"] = "article"
    description: str | None = Field(default=None, max_length=2000)
    min_age: int = Field(default=6, ge=5, le=25)
    max_age: int = Field(default=21, ge=5, le=25)


# ---------------- interests ----------------

class InterestOut(ORM):
    id: uuid.UUID
    domain_id: uuid.UUID
    subdomain_id: uuid.UUID | None
    strength: int
    is_favourite: bool
    source: str
    created_at: datetime


class InterestSelection(BaseModel):
    domain_id: uuid.UUID
    subdomain_id: uuid.UUID | None = None
    strength: int = Field(default=3, ge=1, le=5)
    is_favourite: bool = False


class InterestsUpdate(BaseModel):
    selections: list[InterestSelection] = Field(max_length=60)
    source: Literal["self", "onboarding", "questionnaire"] = "self"


class ExploreIn(BaseModel):
    domain_id: uuid.UUID
    subdomain_id: uuid.UUID | None = None


class QuestionnaireAnswer(BaseModel):
    question_id: str = Field(max_length=40)
    option_ids: list[str] = Field(max_length=10)


class QuestionnaireSubmit(BaseModel):
    answers: list[QuestionnaireAnswer] = Field(min_length=1, max_length=30)


class InterestHistoryOut(ORM):
    id: uuid.UUID
    domain_id: uuid.UUID | None
    subdomain_id: uuid.UUID | None
    action: str
    old_value: dict[str, Any] | None
    new_value: dict[str, Any] | None
    source: str
    created_at: datetime


# ---------------- rubrics ----------------

class RubricCriterion(BaseModel):
    key: str = Field(pattern=r"^[a-z0-9_]{1,40}$")
    label: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    max_points: float = Field(gt=0, le=100)
    dimension: Dimension = "performance"


class RubricIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    domain_id: uuid.UUID | None = None
    criteria: list[RubricCriterion] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def _unique(self):
        keys = [c.key for c in self.criteria]
        if len(keys) != len(set(keys)):
            raise ValueError("Rubric criterion keys must be unique")
        return self


class RubricOut(ORM):
    id: uuid.UUID
    title: str
    domain_id: uuid.UUID | None
    criteria: list[dict[str, Any]]
    institution_id: uuid.UUID | None


# ---------------- activities ----------------

class ActivityBase(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    domain_id: uuid.UUID
    subdomain_id: uuid.UUID | None = None
    category: ActivityCategory
    description: str = Field(min_length=10, max_length=5000)
    min_age: int = Field(default=6, ge=5, le=25)
    max_age: int = Field(default=21, ge=5, le=25)
    difficulty: int = Field(default=1, ge=1, le=5)
    estimated_minutes: int = Field(default=30, ge=5, le=600)
    instructions: str = Field(min_length=5, max_length=10000)
    evaluation_criteria: list[str] = Field(default_factory=list, max_length=12)
    submission_type: SubmissionType = "text"
    max_score: float = Field(default=100, gt=0, le=1000)
    status: Literal["draft", "published", "archived"] = "published"
    is_team: bool = False
    xp_reward: int = Field(default=20, ge=0, le=500)
    rubric_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _ages(self):
        if self.min_age > self.max_age:
            raise ValueError("min_age must be <= max_age")
        return self


class ActivityIn(ActivityBase):
    pass


class ActivityUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    subdomain_id: uuid.UUID | None = None
    category: ActivityCategory | None = None
    description: str | None = Field(default=None, min_length=10, max_length=5000)
    min_age: int | None = Field(default=None, ge=5, le=25)
    max_age: int | None = Field(default=None, ge=5, le=25)
    difficulty: int | None = Field(default=None, ge=1, le=5)
    estimated_minutes: int | None = Field(default=None, ge=5, le=600)
    instructions: str | None = Field(default=None, min_length=5, max_length=10000)
    evaluation_criteria: list[str] | None = None
    submission_type: SubmissionType | None = None
    max_score: float | None = Field(default=None, gt=0, le=1000)
    status: Literal["draft", "published", "archived"] | None = None
    xp_reward: int | None = Field(default=None, ge=0, le=500)
    rubric_id: uuid.UUID | None = None


class ActivityOut(ORM):
    id: uuid.UUID
    title: str
    domain_id: uuid.UUID
    domain_name: str | None = None
    domain_color: str | None = None
    subdomain_id: uuid.UUID | None
    subdomain_name: str | None = None
    category: str
    description: str
    min_age: int
    max_age: int
    difficulty: int
    estimated_minutes: int
    instructions: str
    evaluation_criteria: list[str]
    submission_type: str
    max_score: float
    status: str
    is_team: bool
    xp_reward: int
    rubric_id: uuid.UUID | None
    rubric: RubricOut | None = None
    institution_id: uuid.UUID | None
    created_at: datetime
    # student context (filled for students)
    my_status: str | None = None
    my_attempts: int | None = None


class AssignIn(BaseModel):
    student_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)
    batch_id: uuid.UUID | None = None
    due_at: datetime | None = None
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _target(self):
        if not self.student_ids and not self.batch_id:
            raise ValueError("Provide student_ids or batch_id")
        return self


class AssignmentOut(ORM):
    id: uuid.UUID
    activity_id: uuid.UUID
    student_id: uuid.UUID
    batch_id: uuid.UUID | None
    due_at: datetime | None
    status: str
    is_voluntary: bool
    note: str | None
    created_at: datetime
    activity: ActivityOut | None = None


# ---------------- submissions ----------------

class SubmissionIn(BaseModel):
    activity_id: uuid.UUID
    content_text: str | None = Field(default=None, max_length=20000)
    link_url: HttpUrl | None = None
    file_ids: list[uuid.UUID] = Field(default_factory=list, max_length=10)
    reflection: str | None = Field(default=None, max_length=3000)
    self_rating: int | None = Field(default=None, ge=1, le=5)


class FileOut(ORM):
    id: uuid.UUID
    original_name: str
    content_type: str
    size_bytes: int
    created_at: datetime


class EvaluationOut(ORM):
    id: uuid.UUID
    submission_id: uuid.UUID | None
    attempt_id: uuid.UUID | None
    evaluator_user_id: uuid.UUID | None
    evaluator_name: str | None = None
    rubric_id: uuid.UUID | None
    criteria_scores: dict[str, Any]
    dimension_scores: dict[str, Any]
    total_score: float
    max_score: float
    normalized_score: float
    evidence_quality: float
    feedback: str | None
    is_auto: bool
    is_current: bool
    created_at: datetime


class SubmissionOut(ORM):
    id: uuid.UUID
    activity_id: uuid.UUID
    activity_title: str | None = None
    domain_id: uuid.UUID | None = None
    student_id: uuid.UUID
    student_name: str | None = None
    assignment_id: uuid.UUID | None
    attempt_no: int
    content_text: str | None
    link_url: str | None
    file_ids: list[uuid.UUID]
    files: list[FileOut] = []
    reflection: str | None
    self_rating: int | None
    status: str
    submitted_at: datetime
    evaluations: list[EvaluationOut] = []


class SubmissionEvaluationIn(BaseModel):
    criteria_scores: dict[str, float] = Field(default_factory=dict)
    total_score: float | None = Field(default=None, ge=0)
    feedback: str | None = Field(default=None, max_length=5000)
    evidence_quality: float = Field(default=0.6, ge=0, le=1)
    mentor_validated: bool = True
    return_for_revision: bool = False


class AttemptEvaluationIn(BaseModel):
    response_points: dict[uuid.UUID, float] = Field(default_factory=dict)
    response_feedback: dict[uuid.UUID, str] = Field(default_factory=dict)
    feedback: str | None = Field(default=None, max_length=5000)


# ---------------- assessments ----------------

class QuestionIn(BaseModel):
    type: QuestionType
    prompt: str = Field(min_length=3, max_length=4000)
    options: list[dict[str, str]] = Field(default_factory=list, max_length=10)
    correct_answer: Any | None = None
    points: float = Field(default=1, gt=0, le=100)
    explanation: str | None = Field(default=None, max_length=2000)
    difficulty: int = Field(default=1, ge=1, le=5)
    sort_order: int = 0

    @model_validator(mode="after")
    def _check(self):
        keys = {o.get("key") for o in self.options}
        if self.type in ("mcq", "multi_select"):
            if len(self.options) < 2:
                raise ValueError("Choice questions need at least two options")
            if self.correct_answer is not None:
                expected = self.correct_answer if isinstance(self.correct_answer, list) else [self.correct_answer]
                if not set(expected) <= keys:
                    raise ValueError("correct_answer must reference option keys")
        if self.type == "numeric" and self.correct_answer is not None:
            if not isinstance(self.correct_answer, dict) or "value" not in self.correct_answer:
                raise ValueError("numeric correct_answer must be {value, tolerance}")
        return self


class QuestionOut(ORM):
    """Student-safe view: never includes the correct answer."""

    id: uuid.UUID
    type: str
    prompt: str
    options: list[dict[str, Any]]
    points: float
    difficulty: int


class QuestionManageOut(QuestionOut):
    correct_answer: Any | None
    explanation: str | None
    sort_order: int


class AssessmentIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    domain_id: uuid.UUID
    subdomain_id: uuid.UUID | None = None
    type: AssessmentType
    description: str | None = Field(default=None, max_length=5000)
    min_age: int = Field(default=6, ge=5, le=25)
    max_age: int = Field(default=21, ge=5, le=25)
    difficulty: int = Field(default=1, ge=1, le=5)
    time_limit_minutes: int | None = Field(default=None, ge=1, le=240)
    max_attempts: int = Field(default=3, ge=1, le=20)
    randomize_questions: bool = True
    questions_per_attempt: int | None = Field(default=None, ge=1, le=200)
    status: Literal["draft", "published", "archived"] = "published"
    rubric_id: uuid.UUID | None = None
    xp_reward: int = Field(default=30, ge=0, le=500)
    questions: list[QuestionIn] = Field(default_factory=list, max_length=200)


class AssessmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    min_age: int | None = Field(default=None, ge=5, le=25)
    max_age: int | None = Field(default=None, ge=5, le=25)
    difficulty: int | None = Field(default=None, ge=1, le=5)
    time_limit_minutes: int | None = Field(default=None, ge=1, le=240)
    max_attempts: int | None = Field(default=None, ge=1, le=20)
    randomize_questions: bool | None = None
    questions_per_attempt: int | None = Field(default=None, ge=1, le=200)
    status: Literal["draft", "published", "archived"] | None = None
    xp_reward: int | None = Field(default=None, ge=0, le=500)


class AssessmentOut(ORM):
    id: uuid.UUID
    title: str
    domain_id: uuid.UUID
    domain_name: str | None = None
    subdomain_id: uuid.UUID | None
    type: str
    description: str | None
    min_age: int
    max_age: int
    difficulty: int
    time_limit_minutes: int | None
    max_attempts: int
    randomize_questions: bool
    questions_per_attempt: int | None
    status: str
    xp_reward: int
    question_count: int = 0
    institution_id: uuid.UUID | None
    created_at: datetime
    my_attempts: int | None = None
    my_best_score: float | None = None


class AssessmentManageOut(AssessmentOut):
    questions: list[QuestionManageOut] = []


class AnswerIn(BaseModel):
    question_id: uuid.UUID
    answer: Any = None

    @field_validator("answer")
    @classmethod
    def _size(cls, v):
        if isinstance(v, str) and len(v) > 10000:
            raise ValueError("Answer is too long")
        if isinstance(v, list) and len(v) > 20:
            raise ValueError("Too many selections")
        return v


class AnswersIn(BaseModel):
    answers: list[AnswerIn] = Field(max_length=200)


class ResponseOut(ORM):
    question_id: uuid.UUID
    answer: Any
    is_correct: bool | None
    points_awarded: float | None
    feedback: str | None


class AttemptOut(ORM):
    id: uuid.UUID
    assessment_id: uuid.UUID
    assessment_title: str | None = None
    student_id: uuid.UUID
    attempt_no: int
    started_at: datetime
    expires_at: datetime | None
    submitted_at: datetime | None
    status: str
    raw_score: float | None
    max_score: float | None
    normalized_score: float | None
    questions: list[QuestionOut] = []
    responses: list[ResponseOut] = []
    review: list[dict[str, Any]] = []  # per-question explanation after evaluation
