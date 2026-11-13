"""Activity management: listing, assignment, submissions and mentor evaluation."""

from __future__ import annotations

import uuid
from datetime import datetime

from pathfinder_engine.scoring import normalize_score
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.errors import Forbidden, NotFound, ValidationFailed
from ..models import (
    Activity,
    ActivityAssignment,
    Batch,
    BatchMember,
    EvaluationRecord,
    MentorFeedback,
    Mentor,
    PortfolioItem,
    ProgressEvent,
    StoredFile,
    Student,
    Submission,
    User,
)
from ..schemas.learning import ActivityOut, EvaluationOut, FileOut, RubricOut, SubmissionOut
from .auth import age_on
from .gamification import record_learning_action
from .notify import notify, notify_guardians
from .scoring import compute_scores

PROJECT_CATEGORIES = {"practical_project", "research_task"}


def activity_out(a: Activity, my_status: str | None = None, my_attempts: int | None = None) -> ActivityOut:
    out = ActivityOut.model_validate(a)
    out.domain_name = a.domain.name if a.domain else None
    out.domain_color = a.domain.color if a.domain else None
    out.subdomain_name = a.subdomain.name if a.subdomain else None
    out.rubric = RubricOut.model_validate(a.rubric) if a.rubric else None
    out.my_status, out.my_attempts = my_status, my_attempts
    return out


def student_activity_context(db: Session, student_id: uuid.UUID) -> tuple[dict, dict]:
    statuses = dict(db.execute(select(ActivityAssignment.activity_id, ActivityAssignment.status)
                               .where(ActivityAssignment.student_id == student_id)).all())
    attempts = dict(db.execute(select(Submission.activity_id, func.count()).where(Submission.student_id == student_id)
                               .group_by(Submission.activity_id)).all())
    return statuses, attempts


def is_age_eligible(a: Activity, student: Student) -> bool:
    age = age_on(student.date_of_birth)
    return a.min_age <= age <= a.max_age


def assign(db: Session, activity: Activity, student_ids: list[uuid.UUID], *, assigned_by: User,
           batch_id: uuid.UUID | None, due_at: datetime | None, note: str | None) -> list[ActivityAssignment]:
    if activity.status != "published":
        raise ValidationFailed("Only published activities can be assigned")
    created = []
    for sid in student_ids:
        existing = db.scalar(select(ActivityAssignment).where(ActivityAssignment.activity_id == activity.id,
                                                              ActivityAssignment.student_id == sid))
        if existing:
            existing.due_at, existing.note = due_at or existing.due_at, note or existing.note
            existing.is_voluntary = False
            existing.assigned_by = assigned_by.id
            created.append(existing)
            continue
        row = ActivityAssignment(activity_id=activity.id, student_id=sid, batch_id=batch_id, assigned_by=assigned_by.id,
                                 due_at=due_at, note=note)
        db.add(row)
        created.append(row)
        student = db.get(Student, sid)
        if student:
            notify(db, student.user_id, "activity_assigned", f"New activity: {activity.title}",
                   f"Assigned by {assigned_by.full_name}", f"/app/activities/{activity.id}")
    db.flush()
    return created


def batch_student_ids(db: Session, batch_id: uuid.UUID) -> list[uuid.UUID]:
    return list(db.scalars(select(BatchMember.student_id).where(BatchMember.batch_id == batch_id)).all())


def create_submission(db: Session, student: Student, user: User, data) -> Submission:
    a = db.get(Activity, data.activity_id)
    if a is None or a.deleted_at is not None or a.status != "published":
        raise NotFound("Activity not found")
    if not is_age_eligible(a, student):
        raise Forbidden("This activity is designed for a different age group")
    has_text = bool(data.content_text and data.content_text.strip())
    if a.submission_type == "text" and not has_text:
        raise ValidationFailed("Please write your answer before submitting")
    if a.submission_type == "link" and not data.link_url:
        raise ValidationFailed("Please add a link to your work")
    if a.submission_type == "file" and not data.file_ids:
        raise ValidationFailed("Please attach at least one file")
    if a.submission_type == "mixed" and not (has_text or data.link_url or data.file_ids):
        raise ValidationFailed("Please add text, a link or a file")
    if data.file_ids:
        owned = set(db.scalars(select(StoredFile.id).where(StoredFile.id.in_(data.file_ids),
                                                           StoredFile.owner_user_id == user.id,
                                                           StoredFile.deleted_at.is_(None))).all())
        if owned != set(data.file_ids):
            raise Forbidden("You can only attach your own uploaded files")
    open_sub = db.scalar(select(Submission).where(Submission.student_id == student.id, Submission.activity_id == a.id,
                                                  Submission.status == "submitted"))
    if open_sub:
        raise ValidationFailed("Your previous submission for this activity is still awaiting review", code="pending_review")

    attempt_no = (db.scalar(select(func.count()).select_from(Submission).where(
        Submission.student_id == student.id, Submission.activity_id == a.id)) or 0) + 1
    assignment = db.scalar(select(ActivityAssignment).where(ActivityAssignment.activity_id == a.id,
                                                            ActivityAssignment.student_id == student.id))
    if assignment is None:
        assignment = ActivityAssignment(activity_id=a.id, student_id=student.id, is_voluntary=True)
        db.add(assignment)
        db.flush()
    assignment.status = "submitted"
    sub = Submission(activity_id=a.id, student_id=student.id, assignment_id=assignment.id, attempt_no=attempt_no,
                     content_text=data.content_text, link_url=str(data.link_url) if data.link_url else None,
                     file_ids=[str(f) for f in data.file_ids], reflection=data.reflection, self_rating=data.self_rating)
    db.add(sub)
    db.flush()
    is_project = a.category in PROJECT_CATEGORIES
    db.add(ProgressEvent(student_id=student.id, domain_id=a.domain_id, subdomain_id=a.subdomain_id,
                         event_type="project_submitted" if is_project else "activity_submitted",
                         source_type="submission", source_id=sub.id, category=a.category, difficulty=a.difficulty,
                         attempt_no=attempt_no, payload={"activity_id": str(a.id), "title": a.title}))
    if data.reflection:
        db.add(ProgressEvent(student_id=student.id, domain_id=a.domain_id, event_type="reflection",
                             source_type="submission", source_id=sub.id, payload={"text": data.reflection[:500]}))
    record_learning_action(db, student, xp=a.xp_reward if attempt_no == 1 else max(a.xp_reward // 4, 5),
                           reason=f"Submitted: {a.title}", goal_kind="activities", source_type="submission",
                           source_id=sub.id)
    mentor_users = db.scalars(select(Mentor.user_id).join(Batch, Batch.mentor_id == Mentor.id)
                              .join(BatchMember, BatchMember.batch_id == Batch.id)
                              .where(BatchMember.student_id == student.id)).all()
    for uid in set(mentor_users):
        notify(db, uid, "submission", f"{user.full_name} submitted '{a.title}'", None, f"/mentor/reviews/{sub.id}")
    return sub


def _rubric_scores(activity: Activity, criteria_scores: dict[str, float]) -> tuple[float, float, dict[str, float]]:
    rubric = activity.rubric
    crit = {c["key"]: c for c in rubric.criteria}
    unknown = set(criteria_scores) - set(crit)
    if unknown:
        raise ValidationFailed(f"Unknown rubric criteria: {sorted(unknown)}")
    missing = set(crit) - set(criteria_scores)
    if missing:
        raise ValidationFailed(f"Score every rubric criterion (missing: {sorted(missing)})")
    by_dim: dict[str, list[float]] = {}
    total = 0.0
    for key, pts in criteria_scores.items():
        mx = float(crit[key]["max_points"])
        if pts < 0 or pts > mx:
            raise ValidationFailed(f"'{crit[key]['label']}' must be between 0 and {mx:g}")
        total += pts
        by_dim.setdefault(crit[key].get("dimension", "performance"), []).append(pts / mx * 100)
    dims = {k: round(sum(v) / len(v), 1) for k, v in by_dim.items() if k != "performance"}
    return total, rubric.max_points, dims


def evaluate_submission(db: Session, sub: Submission, evaluator: User, data) -> EvaluationRecord:
    a = sub.activity
    if a.rubric:
        total, max_score, dims = _rubric_scores(a, data.criteria_scores)
    else:
        if data.total_score is None:
            raise ValidationFailed("total_score is required when the activity has no rubric")
        if data.total_score > a.max_score:
            raise ValidationFailed(f"Score cannot exceed {a.max_score:g}")
        total, max_score, dims = float(data.total_score), float(a.max_score), {}
    pct = normalize_score(total, max_score)
    if pct is None:
        raise ValidationFailed("Cannot normalise score (max score is zero)")

    # History is preserved: older evaluations/evidence are flagged, never deleted.
    for old in db.scalars(select(EvaluationRecord).where(EvaluationRecord.submission_id == sub.id,
                                                         EvaluationRecord.is_current.is_(True))).all():
        old.is_current = False
    for ev in db.scalars(select(ProgressEvent).where(ProgressEvent.source_type == "submission",
                                                     ProgressEvent.source_id == sub.id,
                                                     ProgressEvent.score_pct.is_not(None))).all():
        ev.is_superseded = True

    rec = EvaluationRecord(submission_id=sub.id, evaluator_user_id=evaluator.id, rubric_id=a.rubric_id,
                           criteria_scores=data.criteria_scores, dimension_scores=dims, total_score=total,
                           max_score=max_score, normalized_score=pct, evidence_quality=data.evidence_quality,
                           feedback=data.feedback, is_auto=False)
    db.add(rec)
    student = db.get(Student, sub.student_id)
    assignment = db.get(ActivityAssignment, sub.assignment_id) if sub.assignment_id else None
    if data.return_for_revision:
        sub.status = "returned"
        if assignment:
            assignment.status = "in_progress"
    else:
        sub.status = "evaluated"
        if assignment:
            assignment.status = "completed"
        is_project = a.category in PROJECT_CATEGORIES
        db.add(ProgressEvent(
            student_id=sub.student_id, domain_id=a.domain_id, subdomain_id=a.subdomain_id,
            event_type="project_submitted" if is_project else "activity_completed", source_type="submission",
            source_id=sub.id, evidence_kind="project" if is_project else "activity", category=a.category,
            score_pct=pct, scale_key=f"activity:{a.id}", difficulty=a.difficulty, attempt_no=sub.attempt_no,
            mentor_validated=data.mentor_validated, evidence_quality=data.evidence_quality, dimension_scores=dims,
            payload={"activity_id": str(a.id), "title": a.title, "evaluator": evaluator.full_name},
        ))
    if data.feedback:
        db.add(MentorFeedback(mentor_user_id=evaluator.id, student_id=sub.student_id, domain_id=a.domain_id,
                              submission_id=sub.id, kind="feedback", content=data.feedback))
        db.add(ProgressEvent(student_id=sub.student_id, domain_id=a.domain_id, event_type="mentor_feedback",
                             source_type="submission", source_id=sub.id, payload={"excerpt": data.feedback[:200]}))
        for item in db.scalars(select(PortfolioItem).where(PortfolioItem.submission_id == sub.id)).all():
            item.mentor_feedback = data.feedback
    title = "Your work needs a small revision" if data.return_for_revision else f"'{a.title}' was reviewed"
    notify(db, student.user_id, "evaluation", title, data.feedback[:200] if data.feedback else None,
           f"/app/activities/{a.id}")
    notify_guardians(db, student.id, "evaluation", f"{student.user.first_name}'s work was reviewed", a.title)
    db.flush()
    compute_scores(db, student)
    return rec


def submission_out(db: Session, sub: Submission, include_evals: bool = True) -> SubmissionOut:
    out = SubmissionOut.model_validate(sub)
    out.activity_title = sub.activity.title
    out.domain_id = sub.activity.domain_id
    student = db.get(Student, sub.student_id)
    out.student_name = student.user.full_name if student else None
    if sub.file_ids:
        out.files = [FileOut.model_validate(f) for f in db.scalars(
            select(StoredFile).where(StoredFile.id.in_([uuid.UUID(str(x)) for x in sub.file_ids]))).all()]
    if include_evals:
        evals = db.scalars(select(EvaluationRecord).where(EvaluationRecord.submission_id == sub.id)
                           .order_by(EvaluationRecord.created_at.desc())).all()
        names = dict(db.execute(select(User.id, User.full_name).where(
            User.id.in_({e.evaluator_user_id for e in evals if e.evaluator_user_id}))).all()) if evals else {}
        out.evaluations = []
        for e in evals:
            eo = EvaluationOut.model_validate(e)
            eo.evaluator_name = names.get(e.evaluator_user_id)
            out.evaluations.append(eo)
    return out
