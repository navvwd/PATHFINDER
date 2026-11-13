"""Assessment engine: question banks, randomised attempts, timing, auto and
manual (rubric) evaluation, score normalisation and evidence recording."""

from __future__ import annotations

import random
import uuid
from datetime import timedelta

from pathfinder_engine.scoring import normalize_score
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.errors import Forbidden, NotFound, ValidationFailed
from ..core.security import utcnow
from ..models import (
    Assessment,
    AssessmentAttempt,
    AssessmentResponse,
    EvaluationRecord,
    ProgressEvent,
    Question,
    Student,
    User,
)
from ..schemas.learning import AssessmentOut, AttemptOut, QuestionOut, ResponseOut
from .access import ensure_student_access
from .auth import age_on
from .gamification import record_learning_action
from .notify import notify
from .scoring import compute_scores

GRACE = timedelta(seconds=60)
DIMENSION_FOR_TYPE = {
    "logical_reasoning": "problem_solving",
    "scenario": "problem_solving",
    "practical_execution": "problem_solving",
    "research": "problem_solving",
    "creative_response": "creativity",
    "presentation": "creativity",
}
CATEGORY_FOR_TYPE = {
    "multiple_choice": "knowledge_quiz",
    "logical_reasoning": "logical_puzzle",
    "scenario": "business_simulation",
    "creative_response": "creative_assignment",
    "practical_execution": "practical_project",
    "project_based": "practical_project",
    "presentation": "public_speaking",
    "research": "research_task",
    "mentor_evaluation": "mentor_evaluation",
}


def assessment_out(a: Assessment, my_attempts: int | None = None, my_best: float | None = None) -> AssessmentOut:
    out = AssessmentOut.model_validate(a)
    out.domain_name = a.domain.name if a.domain else None
    out.question_count = len(a.questions)
    out.my_attempts, out.my_best_score = my_attempts, my_best
    return out


def _grade(q: Question, answer) -> tuple[bool | None, float | None]:
    if not q.auto_gradable:
        return None, None
    ca = q.correct_answer
    if answer is None:
        return False, 0.0
    if q.type == "mcq":
        expected = ca[0] if isinstance(ca, list) else ca
        ok = str(answer) == str(expected)
    elif q.type == "multi_select":
        exp = set(ca if isinstance(ca, list) else [ca])
        got = set(answer if isinstance(answer, list) else [answer])
        ok = got == exp
    elif q.type == "numeric":
        try:
            ok = abs(float(answer) - float(ca["value"])) <= float(ca.get("tolerance", 0))
        except (TypeError, ValueError):
            ok = False
    else:
        return None, None
    return ok, (q.points if ok else 0.0)


def start_attempt(db: Session, student: Student, a: Assessment) -> AssessmentAttempt:
    if a.status != "published" or a.deleted_at is not None:
        raise NotFound("Assessment not found")
    age = age_on(student.date_of_birth)
    if not (a.min_age <= age <= a.max_age):
        raise Forbidden("This assessment is designed for a different age group")
    open_attempt = db.scalar(select(AssessmentAttempt).where(AssessmentAttempt.assessment_id == a.id,
                                                             AssessmentAttempt.student_id == student.id,
                                                             AssessmentAttempt.status == "in_progress"))
    if open_attempt:
        if open_attempt.expires_at is None or open_attempt.expires_at + GRACE > utcnow():
            return open_attempt
        finalize_attempt(db, student, open_attempt)
    used = db.scalar(select(func.count()).select_from(AssessmentAttempt).where(
        AssessmentAttempt.assessment_id == a.id, AssessmentAttempt.student_id == student.id)) or 0
    if used >= a.max_attempts:
        raise ValidationFailed(f"You have used all {a.max_attempts} attempts for this assessment", code="no_attempts_left")
    qs = list(a.questions)
    if not qs:
        raise ValidationFailed("This assessment has no questions yet")
    if a.randomize_questions:
        random.shuffle(qs)
    if a.questions_per_attempt:
        qs = qs[: a.questions_per_attempt]
    now = utcnow()
    attempt = AssessmentAttempt(assessment_id=a.id, student_id=student.id, attempt_no=used + 1,
                                question_ids=[str(q.id) for q in qs], started_at=now,
                                expires_at=now + timedelta(minutes=a.time_limit_minutes) if a.time_limit_minutes else None)
    db.add(attempt)
    db.flush()
    return attempt


def save_answers(db: Session, attempt: AssessmentAttempt, answers) -> None:
    if attempt.status != "in_progress":
        raise ValidationFailed("This attempt is already submitted")
    if attempt.expires_at and utcnow() > attempt.expires_at + GRACE:
        raise ValidationFailed("Time is up for this attempt", code="attempt_expired")
    allowed = set(attempt.question_ids)
    existing = {str(r.question_id): r for r in attempt.responses}
    for a in answers:
        qid = str(a.question_id)
        if qid not in allowed:
            raise ValidationFailed("Question is not part of this attempt")
        if qid in existing:
            existing[qid].answer = a.answer
        else:
            r = AssessmentResponse(question_id=a.question_id, answer=a.answer)
            attempt.responses.append(r)
            existing[qid] = r
    db.flush()


def _questions(db: Session, attempt: AssessmentAttempt) -> list[Question]:
    ids = [uuid.UUID(q) for q in attempt.question_ids]
    qmap = {q.id: q for q in db.scalars(select(Question).where(Question.id.in_(ids))).all()}
    return [qmap[i] for i in ids if i in qmap]


def finalize_attempt(db: Session, student: Student, attempt: AssessmentAttempt) -> AssessmentAttempt:
    if attempt.status != "in_progress":
        raise ValidationFailed("This attempt is already submitted")
    a = attempt.assessment
    qs = _questions(db, attempt)
    responses = {r.question_id: r for r in attempt.responses}
    needs_review = False
    raw = 0.0
    max_pts = 0.0
    for q in qs:
        r = responses.get(q.id)
        if r is None:
            r = AssessmentResponse(question_id=q.id, answer=None)
            attempt.responses.append(r)
        if a.type == "self_reflection":
            continue
        max_pts += q.points
        ok, pts = _grade(q, r.answer)
        if ok is None:
            needs_review = True
        else:
            r.is_correct, r.points_awarded = ok, pts
            raw += pts or 0.0
    attempt.submitted_at = utcnow()
    attempt.max_score = max_pts
    if a.type == "self_reflection":
        attempt.status = "evaluated"
        db.add(ProgressEvent(student_id=student.id, domain_id=a.domain_id, event_type="reflection",
                             source_type="assessment_attempt", source_id=attempt.id,
                             payload={"assessment": a.title}))
    elif needs_review:
        attempt.status = "pending_review"
        attempt.raw_score = raw
    else:
        _complete(db, student, attempt, raw, max_pts, evaluator=None, feedback=None)
    record_learning_action(db, student, xp=a.xp_reward if attempt.attempt_no == 1 else max(a.xp_reward // 3, 5),
                           reason=f"Assessment: {a.title}", goal_kind="assessments",
                           source_type="assessment_attempt", source_id=attempt.id)
    return attempt


def _complete(db: Session, student: Student, attempt: AssessmentAttempt, raw: float, max_pts: float,
              evaluator: User | None, feedback: str | None) -> EvaluationRecord:
    a = attempt.assessment
    pct = normalize_score(raw, max_pts)
    if pct is None:
        raise ValidationFailed("Assessment has no scorable points")
    attempt.raw_score, attempt.max_score, attempt.normalized_score = raw, max_pts, pct
    attempt.status = "evaluated"
    dim = DIMENSION_FOR_TYPE.get(a.type)
    for old in db.scalars(select(EvaluationRecord).where(EvaluationRecord.attempt_id == attempt.id,
                                                         EvaluationRecord.is_current.is_(True))).all():
        old.is_current = False
    rec = EvaluationRecord(attempt_id=attempt.id, evaluator_user_id=evaluator.id if evaluator else None,
                           rubric_id=a.rubric_id, total_score=raw, max_score=max_pts, normalized_score=pct,
                           dimension_scores={dim: pct} if dim else {}, feedback=feedback, is_auto=evaluator is None,
                           evidence_quality=0.4 if evaluator is None else 0.7)
    db.add(rec)
    db.add(ProgressEvent(
        student_id=student.id, domain_id=a.domain_id, subdomain_id=a.subdomain_id, event_type="assessment_completed",
        source_type="assessment_attempt", source_id=attempt.id, evidence_kind="assessment",
        category=CATEGORY_FOR_TYPE.get(a.type, "knowledge_quiz"), score_pct=pct, scale_key=a.scale_key,
        difficulty=a.difficulty, attempt_no=attempt.attempt_no, mentor_validated=evaluator is not None,
        evidence_quality=rec.evidence_quality, dimension_scores={dim: pct} if dim else {},
        payload={"assessment_id": str(a.id), "title": a.title, "type": a.type},
    ))
    db.flush()
    compute_scores(db, student)
    return rec


def evaluate_attempt_manually(db: Session, attempt_id: uuid.UUID, evaluator: User, data) -> EvaluationRecord:
    attempt = db.get(AssessmentAttempt, attempt_id)
    if attempt is None:
        raise NotFound("Attempt not found")
    student = ensure_student_access(db, evaluator, attempt.student_id, write=True)
    if attempt.status not in ("pending_review", "evaluated"):
        raise ValidationFailed("Attempt has not been submitted yet")
    qs = {q.id: q for q in _questions(db, attempt)}
    responses = {r.question_id: r for r in attempt.responses}
    for qid, pts in data.response_points.items():
        q = qs.get(qid)
        if q is None:
            raise ValidationFailed("Question not in this attempt")
        if pts < 0 or pts > q.points:
            raise ValidationFailed(f"Points must be between 0 and {q.points:g}")
        r = responses.get(qid)
        if r is None:
            raise ValidationFailed("No response recorded for this question")
        r.points_awarded = pts
        r.is_correct = pts >= q.points
        if qid in data.response_feedback:
            r.feedback = data.response_feedback[qid][:2000]
    unscored = [q for qid, q in qs.items() if responses.get(qid) is None or responses[qid].points_awarded is None]
    if unscored:
        raise ValidationFailed(f"{len(unscored)} question(s) still need points")
    raw = sum(responses[qid].points_awarded or 0 for qid in qs)
    max_pts = sum(q.points for q in qs.values())
    # supersede earlier evidence for this attempt (re-evaluation keeps history)
    for ev in db.scalars(select(ProgressEvent).where(ProgressEvent.source_type == "assessment_attempt",
                                                     ProgressEvent.source_id == attempt.id,
                                                     ProgressEvent.score_pct.is_not(None))).all():
        ev.is_superseded = True
    rec = _complete(db, student, attempt, raw, max_pts, evaluator, data.feedback)
    notify(db, student.user_id, "evaluation", f"'{attempt.assessment.title}' has been reviewed", data.feedback,
           f"/app/assessments/attempts/{attempt.id}")
    return rec


def attempt_out(db: Session, attempt: AssessmentAttempt, reveal: bool) -> AttemptOut:
    out = AttemptOut.model_validate(attempt, from_attributes=True)
    out.assessment_title = attempt.assessment.title
    qs = _questions(db, attempt)
    out.questions = [QuestionOut.model_validate(q) for q in qs]
    out.responses = [ResponseOut.model_validate(r) for r in attempt.responses]
    if reveal and attempt.status == "evaluated":
        out.review = [{"question_id": str(q.id), "correct_answer": q.correct_answer, "explanation": q.explanation}
                      for q in qs if q.correct_answer is not None or q.explanation]
    return out
