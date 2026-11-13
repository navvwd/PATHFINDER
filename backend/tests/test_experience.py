"""Role experiences: live sessions & attendance, student courses, mentor attention,
guardian answers, admin overview/roles, student <-> mentor messaging, remember-me."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

API = "/api/v1"


def _mentor_students(client, headers):
    return client.get(f"{API}/mentors/me/students", headers=headers).json()


def test_sessions_visible_per_role_and_links_gated(client, as_user):
    student = as_user("aarav")
    upcoming = client.get(f"{API}/sessions", headers=student).json()
    assert upcoming, "demo seed schedules upcoming sessions"
    assert all(s["phase"] in ("upcoming", "live") for s in upcoming)
    # Links are hidden until 15 minutes before start.
    assert all(s["meeting_url"] is None for s in upcoming if not s["can_join"])
    past = client.get(f"{API}/sessions?when=past", headers=student).json()
    assert past and all(s["my_attendance"] in ("present", "late", "absent", "excused") for s in past)

    summary = client.get(f"{API}/sessions/attendance-summary", headers=student).json()
    assert summary["sessions"] >= 1 and 0 <= summary["rate"] <= 100

    # Students cannot schedule sessions or read the roster.
    r = client.post(f"{API}/sessions", headers=student, json={
        "title": "Nope", "starts_at": datetime.now(timezone.utc).isoformat(), "location": "x", "student_ids": []})
    assert r.status_code in (403, 422)
    assert client.get(f"{API}/sessions/{past[0]['id']}/attendance", headers=student).status_code == 403


def test_mentor_schedules_session_and_marks_attendance(client, as_user):
    mentor = as_user("mentor")
    kids = _mentor_students(client, mentor)
    ids = [k["id"] for k in kids[:2]]
    start = datetime.now(timezone.utc) + timedelta(days=2)
    r = client.post(f"{API}/sessions", headers=mentor, json={
        "title": "Robotics Q&A", "starts_at": start.isoformat(), "duration_minutes": 30,
        "meeting_url": "https://meet.example.com/robotics", "student_ids": ids})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert r.json()["participants"] == len(ids)
    # Cannot mark attendance before the session starts.
    r = client.put(f"{API}/sessions/{sid}/attendance", headers=mentor,
                   json={"records": [{"student_id": ids[0], "attendance": "present"}]})
    assert r.status_code == 422

    # A teacher who does not own the session cannot change it.
    assert client.patch(f"{API}/sessions/{sid}", headers=as_user("teacher"), json={"status": "cancelled"}).status_code == 403

    # Past session from the seed: mark attendance.
    past = client.get(f"{API}/sessions?when=past", headers=mentor).json()[0]
    roster = client.get(f"{API}/sessions/{past['id']}/attendance", headers=mentor).json()["records"]
    first = roster[0]["student_id"]
    r = client.put(f"{API}/sessions/{past['id']}/attendance", headers=mentor,
                   json={"records": [{"student_id": first, "attendance": "excused"}]})
    assert r.status_code == 200
    assert next(x for x in r.json()["records"] if x["student_id"] == first)["attendance"] == "excused"

    # Scheduling for students outside the mentor's batches is refused.
    others = {k["id"] for k in _mentor_students(client, as_user("teacher"))} - {k["id"] for k in kids}
    if others:
        r = client.post(f"{API}/sessions", headers=mentor, json={
            "title": "Sneaky", "starts_at": start.isoformat(), "location": "Room 1", "student_ids": [others.pop()]})
        assert r.status_code == 403

    assert client.patch(f"{API}/sessions/{sid}", headers=mentor, json={"status": "cancelled"}).json()["phase"] == "cancelled"


def test_student_courses_and_messaging_mentor(client, as_user):
    student = as_user("aarav")
    courses = client.get(f"{API}/students/courses", headers=student).json()
    assert courses
    c = courses[0]
    assert c["lessons_total"] >= c["lessons_completed"] >= 0 and 0 <= c["percent"] <= 100

    contacts = client.get(f"{API}/messages/contacts", headers=student).json()
    assert contacts and all(x["role"] in ("mentor", "teacher") for x in contacts)
    r = client.post(f"{API}/messages", headers=student, json={
        "student_id": client.get(f"{API}/students/me", headers=student).json()["id"],
        "recipient_id": contacts[0]["user_id"], "body": "Can we go over my circuit project?"})
    assert r.status_code == 201, r.text
    assert client.get(f"{API}/messages", headers=student).json()[-1]["body"].startswith("Can we go over")


def test_mentor_attention_and_guardian_answers(client, as_user):
    attention = client.get(f"{API}/mentors/me/attention", headers=as_user("mentor")).json()
    assert isinstance(attention, list)
    for row in attention:
        assert row["reasons"] and all(r["text"] for r in row["reasons"])
    assert client.get(f"{API}/mentors/me/attention", headers=as_user("aarav")).status_code == 403

    parent = as_user("parent")
    kid = client.get(f"{API}/guardians/me/children", headers=parent).json()[0]
    ov = client.get(f"{API}/guardians/children/{kid['id']}/overview", headers=parent).json()
    assert {"tasks", "attendance", "upcoming_sessions", "achievements"} <= ov.keys()
    assert all(s.get("meeting_url") is None for s in ov["upcoming_sessions"])
    # Guardians see a child's sessions but never the join link.
    sessions = client.get(f"{API}/sessions?student_id={kid['id']}", headers=parent).json()
    assert all(s["meeting_url"] is None for s in sessions)


def test_admin_overview_and_role_matrix(client, as_user):
    admin = as_user("superadmin")
    ov = client.get(f"{API}/admin/overview", headers=admin).json()
    assert ov["accounts"]["active"] > 0 and "students_without_mentor" in ov["allocation"]
    roles = client.get(f"{API}/admin/roles", headers=admin).json()
    student = next(r for r in roles["roles"] if r["role"] == "student")
    assert "sessions:manage" not in student["permissions"]
    assert client.get(f"{API}/admin/roles", headers=as_user("mentor")).status_code == 403


def test_student_tasks_and_week(client, as_user):
    student = as_user("aarav")
    t = client.get(f"{API}/students/tasks", headers=student).json()
    assert {"pending", "completed", "quiz_results", "counts"} <= t.keys()
    w = client.get(f"{API}/students/week", headers=student).json()
    assert len(w["days"]) == 14 and w["actions_this_week"] >= 0
    parent = as_user("parent")
    kid = client.get(f"{API}/guardians/me/children", headers=parent).json()[0]
    assert client.get(f"{API}/students/tasks?student_id={kid['id']}", headers=parent).status_code == 200
    assert client.get(f"{API}/students/tasks?student_id={kid['id']}", headers=as_user("myra")).status_code == 403


def test_remember_me_controls_cookie_lifetime(client):
    body = {"identifier": "aarav@pathfinder.demo", "password": "Demo@1234"}
    r = client.post(f"{API}/auth/login", json={**body, "remember_me": False})
    assert r.status_code == 200
    assert "max-age" not in r.headers["set-cookie"].lower()
    r = client.post(f"{API}/auth/login", json={**body, "remember_me": True})
    assert "max-age" in r.headers["set-cookie"].lower()
