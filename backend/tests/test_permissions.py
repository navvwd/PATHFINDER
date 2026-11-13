"""RBAC, record-level access and tenant isolation are enforced on the backend."""

from conftest import register_student


def _student_id(client, headers):
    return client.get("/api/v1/auth/me", headers=headers).json()["student_id"]


def test_students_cannot_manage_or_see_others(client, as_user):
    kid = as_user("aarav")
    assert client.get("/api/v1/students", headers=kid).status_code == 403
    assert client.post("/api/v1/activities", headers=kid, json={}).status_code in (403, 422)
    other = _student_id(client, as_user("diya"))
    assert client.get(f"/api/v1/students/{other}", headers=kid).status_code == 403
    assert client.get(f"/api/v1/progress/summary?student_id={other}", headers=kid).status_code == 403
    assert client.get("/api/v1/admin/audit-logs", headers=kid).status_code == 403
    assert client.get("/api/v1/users", headers=kid).status_code == 403


def test_permission_check_is_server_side_for_activity_creation(client, as_user):
    r = client.post("/api/v1/activities", headers=as_user("aarav"), json={
        "title": "Hack", "domain_id": "00000000-0000-0000-0000-000000000000", "category": "logical_puzzle",
        "description": "xxxxxxxxxxxx", "instructions": "xxxxxxx"})
    assert r.status_code == 403
    assert r.json()["error"]["details"]["missing"] == ["activities:manage"]


def test_guardian_sees_only_linked_children(client, as_user):
    parent = as_user("parent")
    kids = client.get("/api/v1/guardians/me/children", headers=parent).json()
    names = {k["full_name"] for k in kids}
    assert names == {"Aarav Mehta", "Ananya Rao"}
    diya = _student_id(client, as_user("diya"))
    assert client.get(f"/api/v1/guardians/children/{diya}/overview", headers=parent).status_code == 403
    aarav = next(k["id"] for k in kids if k["full_name"] == "Aarav Mehta")
    assert client.get(f"/api/v1/guardians/children/{aarav}/overview", headers=parent).status_code == 200
    # read-only: guardians cannot regenerate recommendations
    assert client.post(f"/api/v1/recommendations/generate?student_id={aarav}", headers=parent).status_code == 403


def test_mentor_tenant_isolation(client, as_user):
    mentor = as_user("mentor")
    outsider, _ = register_student(client)  # no institution
    sid = _student_id(client, outsider)
    assert client.get(f"/api/v1/students/{sid}", headers=mentor).status_code == 403
    listed = client.get("/api/v1/mentors/me/students", headers=mentor).json()
    assert all(s["institution_id"] for s in listed)
    # institution admin cannot read a different tenant
    admin = as_user("admin")
    r = client.post("/api/v1/institutions", headers=admin, json={"name": "Other School", "code": "OTHER-1"})
    other = r.json()["id"]
    assert client.get(f"/api/v1/institutions/{other}", headers=as_user("principal")).status_code == 404


def test_role_hierarchy_for_admin_features(client, as_user):
    assert client.get("/api/v1/admin/audit-logs", headers=as_user("admin")).status_code == 403  # platform admin
    assert client.get("/api/v1/admin/audit-logs", headers=as_user("superadmin")).status_code == 200
    r = client.post("/api/v1/users", headers=as_user("principal"),
                    json={"full_name": "New Admin", "email": "x-admin@example.com", "password": "Passw0rd!", "role": "super_admin"})
    assert r.status_code == 403
