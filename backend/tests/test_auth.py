from conftest import login, register_student, unique_email


def test_register_login_me_and_refresh_cookie(client):
    headers, body = register_student(client)
    me = client.get("/api/v1/auth/me", headers=headers).json()
    assert me["user"]["role"] == "student" and me["student_id"]
    assert "activities:submit" in me["permissions"]
    assert me["onboarding_complete"] is False
    # web login sets an httpOnly refresh cookie and does not expose the token in JSON
    r = client.post("/api/v1/auth/login", json={"identifier": body["email"], "password": body["password"]})
    assert r.json().get("refresh_token") is None
    assert "httponly" in r.headers["set-cookie"].lower()
    # cookie refresh requires the anti-CSRF header
    assert client.post("/api/v1/auth/refresh").status_code == 401
    r = client.post("/api/v1/auth/refresh", headers={"X-Requested-With": "pathfinder"})
    assert r.status_code == 200 and r.json()["access_token"]


def test_mobile_refresh_rotation_and_reuse_detection(client):
    _, body = register_student(client)
    r = client.post("/api/v1/auth/login", json={"identifier": body["email"], "password": body["password"], "client": "mobile"})
    rt = r.json()["refresh_token"]
    r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": rt})
    assert r2.status_code == 200
    new_rt = r2.json()["refresh_token"]
    assert new_rt != rt
    # reusing the rotated token revokes every session
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": rt}).status_code == 401
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": new_rt}).status_code == 401


def test_password_rules_duplicates_and_validation(client):
    r = client.post("/api/v1/auth/register/student", json={"full_name": "A B", "email": unique_email(), "password": "password",
                                                            "date_of_birth": "2012-01-01"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "weak_password"
    _, body = register_student(client)
    r = client.post("/api/v1/auth/register/student", json={**body})
    assert r.status_code == 409
    r = client.post("/api/v1/auth/register/student", json={"full_name": "<script>x</script>", "email": unique_email(),
                                                            "password": "Passw0rd!", "date_of_birth": "2012-01-01"})
    assert r.status_code == 422
    r = client.post("/api/v1/auth/register/student", json={"full_name": "No Contact", "password": "Passw0rd!",
                                                            "date_of_birth": "2012-01-01"})
    assert r.status_code == 422


def test_lockout_after_failed_logins(client):
    _, body = register_student(client)
    for _ in range(5):
        r = client.post("/api/v1/auth/login", json={"identifier": body["email"], "password": "wrong-pass1"})
        assert r.status_code == 401
    r = client.post("/api/v1/auth/login", json={"identifier": body["email"], "password": body["password"]})
    assert r.status_code == 403 and r.json()["error"]["code"] == "account_locked"


def test_password_reset_flow_revokes_sessions(client):
    headers, body = register_student(client)
    r = client.post("/api/v1/auth/password/forgot", json={"identifier": body["email"]})
    token = r.json()["debug_reset_token"]
    assert client.post("/api/v1/auth/password/forgot", json={"identifier": "nobody@example.com"}).status_code == 202
    assert client.post("/api/v1/auth/password/reset", json={"token": token, "new_password": "NewPassw0rd"}).status_code == 200
    assert client.get("/api/v1/auth/me", headers=headers).status_code == 401  # old access token revoked
    assert client.post("/api/v1/auth/password/reset", json={"token": token, "new_password": "Another1pw"}).status_code == 422
    login(client, body["email"], "NewPassw0rd")


def test_unauthenticated_and_bad_tokens(client):
    assert client.get("/api/v1/students/me").status_code == 401
    r = client.get("/api/v1/students/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_token"
