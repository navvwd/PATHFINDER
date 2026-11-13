from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Guardian, Notification, StudentGuardian, User

# Notification kinds a user can mute through preferences
PREF_FOR_KIND = {
    "activity_assigned": "activity_reminders",
    "mentor_feedback": "mentor_feedback",
    "evaluation": "mentor_feedback",
}


def notify(db: Session, user_id: uuid.UUID, kind: str, title: str, body: str | None = None, link: str | None = None) -> None:
    user = db.get(User, user_id)
    if user is None:
        return
    pref = PREF_FOR_KIND.get(kind)
    if pref and (user.preferences or {}).get("notifications", {}).get(pref) is False:
        return
    db.add(Notification(user_id=user_id, kind=kind, title=title[:200], body=body, link=link))


def notify_guardians(db: Session, student_id: uuid.UUID, kind: str, title: str, body: str | None = None,
                     link: str | None = None) -> None:
    rows = db.execute(
        select(Guardian.user_id).join(StudentGuardian, StudentGuardian.guardian_id == Guardian.id)
        .where(StudentGuardian.student_id == student_id, StudentGuardian.status == "active")
    ).scalars().all()
    for uid in rows:
        notify(db, uid, kind, title, body, link)
