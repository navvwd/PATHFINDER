"""Healthy, non-competitive gamification: personal XP, streaks, badges, goals.
There are deliberately no leaderboards or public rankings anywhere."""

from __future__ import annotations

import math
import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
    Achievement,
    ProgressEvent,
    Student,
    StudentAchievement,
    Submission,
    WeeklyGoal,
    XPTransaction,
)
from .notify import notify


def level_for_xp(xp: int) -> tuple[int, int, int]:
    """Gentle curve: level n needs 100 * n^1.5 cumulative XP. Returns (level, into, needed)."""
    level = 1
    while 100 * math.pow(level, 1.5) <= xp:
        level += 1
    prev = 0 if level == 1 else int(100 * math.pow(level - 1, 1.5))
    nxt = int(100 * math.pow(level, 1.5))
    return level, xp - prev, nxt - prev


def week_start(d: date | None = None) -> date:
    d = d or date.today()
    return d - timedelta(days=d.weekday())


def award_xp(db: Session, student: Student, amount: int, reason: str, source_type: str | None = None,
             source_id: uuid.UUID | None = None) -> None:
    if amount <= 0:
        return
    student.xp = (student.xp or 0) + amount
    db.add(XPTransaction(student_id=student.id, amount=amount, reason=reason, source_type=source_type, source_id=source_id))


def touch_streak(student: Student, today: date | None = None) -> None:
    today = today or date.today()
    last = student.last_active_on
    if last == today:
        return
    if last == today - timedelta(days=1):
        student.current_streak = (student.current_streak or 0) + 1
    else:
        student.current_streak = 1
    student.longest_streak = max(student.longest_streak or 0, student.current_streak)
    student.last_active_on = today


def bump_goals(db: Session, student: Student, kind: str) -> None:
    goals = db.scalars(select(WeeklyGoal).where(
        WeeklyGoal.student_id == student.id, WeeklyGoal.week_start == week_start(),
        WeeklyGoal.kind == kind, WeeklyGoal.status == "active",
    )).all()
    for g in goals:
        g.current_count += 1
        if g.current_count >= g.target_count:
            g.status = "completed"
            award_xp(db, student, 40, f"Weekly goal completed: {g.title}", "weekly_goal", g.id)
            notify(db, student.user_id, "goal_completed", "Weekly goal complete!", g.title, "/app/achievements")


def ensure_default_goals(db: Session, student: Student) -> None:
    ws = week_start()
    exists = db.scalar(select(func.count()).select_from(WeeklyGoal).where(
        WeeklyGoal.student_id == student.id, WeeklyGoal.week_start == ws))
    if not exists:
        db.add(WeeklyGoal(student_id=student.id, week_start=ws, title="Complete 3 activities", kind="activities", target_count=3))
        db.add(WeeklyGoal(student_id=student.id, week_start=ws, title="Take 1 assessment", kind="assessments", target_count=1))


def _metric(db: Session, student: Student, kind: str) -> int:
    if kind == "activities_completed":
        return db.scalar(select(func.count()).select_from(Submission).where(Submission.student_id == student.id)) or 0
    if kind == "assessments_completed":
        return db.scalar(select(func.count()).select_from(ProgressEvent).where(
            ProgressEvent.student_id == student.id, ProgressEvent.event_type == "assessment_completed")) or 0
    if kind == "projects_submitted":
        return db.scalar(select(func.count()).select_from(ProgressEvent).where(
            ProgressEvent.student_id == student.id, ProgressEvent.event_type == "project_submitted")) or 0
    if kind == "domains_explored":
        return db.scalar(select(func.count(func.distinct(ProgressEvent.domain_id))).where(
            ProgressEvent.student_id == student.id, ProgressEvent.domain_id.is_not(None))) or 0
    if kind == "streak":
        return student.longest_streak or 0
    if kind == "xp":
        return student.xp or 0
    if kind == "goals_completed":
        return db.scalar(select(func.count()).select_from(WeeklyGoal).where(
            WeeklyGoal.student_id == student.id, WeeklyGoal.status == "completed")) or 0
    return 0


def check_achievements(db: Session, student: Student) -> list[Achievement]:
    db.flush()
    earned_ids = set(db.scalars(select(StudentAchievement.achievement_id).where(StudentAchievement.student_id == student.id)).all())
    new: list[Achievement] = []
    for ach in db.scalars(select(Achievement)).all():
        if ach.id in earned_ids:
            continue
        crit = ach.criteria or {}
        if _metric(db, student, crit.get("type", "")) >= int(crit.get("threshold", 10**9)):
            db.add(StudentAchievement(student_id=student.id, achievement_id=ach.id, context={"criteria": crit}))
            award_xp(db, student, ach.xp_reward, f"Badge: {ach.title}", "achievement", ach.id)
            db.add(ProgressEvent(student_id=student.id, event_type="achievement_unlocked", source_type="achievement",
                                 source_id=ach.id, payload={"title": ach.title}))
            notify(db, student.user_id, "achievement", f"New badge: {ach.title}", ach.description, "/app/achievements")
            new.append(ach)
    return new


def record_learning_action(db: Session, student: Student, *, xp: int, reason: str, goal_kind: str | None,
                           source_type: str, source_id: uuid.UUID) -> None:
    """Common bookkeeping after any completed learning action."""
    touch_streak(student)
    award_xp(db, student, xp, reason, source_type, source_id)
    if goal_kind:
        bump_goals(db, student, goal_kind)
    check_achievements(db, student)
