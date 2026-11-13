"""End-to-end student journey: register -> onboard -> explore -> select interests ->
complete activities -> mentor evaluation -> assessment -> progress -> portfolio ->
recommendations -> roadmap. Also checks parent consent and monitoring."""

from conftest import login, unique_email


def test_full_student_parent_mentor_journey(client, as_user):
    from datetime import date

    # --- register (minor, joins demo institution) ---
    email = unique_email("journey")
    r = client.post("/api/v1/auth/register/student", json={
        "full_name": "Journey Kid", "email": email, "password": "Passw0rd!",
        "date_of_birth": date(date.today().year - 13, 3, 3).isoformat(), "institution_code": "GVPS-DEMO"})
    assert r.status_code == 201
    kid = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = client.get("/api/v1/auth/me", headers=kid).json()
    sid = me["student_id"]
    assert me["consent_status"] == "pending"

    # --- explore six domains ---
    domains = client.get("/api/v1/domains", headers=kid).json()
    assert len(domains) == 6 and all(len(d["subdomains"]) == 8 for d in domains)
    stem = next(d for d in domains if d["slug"] == "stem")
    detail = client.get("/api/v1/domains/stem", headers=kid).json()
    assert detail["advantages"] and detail["resources"] and detail["roadmap_template"]

    # --- onboarding ---
    assert client.post("/api/v1/students/me/onboarding/complete", headers=kid).status_code == 422
    client.put("/api/v1/students/me/onboarding/academic", headers=kid, json={"school_name": "GV", "grade": "8"})
    st = client.put("/api/v1/students/me/onboarding/interests", headers=kid, json={
        "hobbies": ["chess", "Chess", " drawing "], "domain_ids": [stem["id"]],
        "subdomain_ids": [stem["subdomains"][0]["id"]], "favourite_domain_id": stem["id"]}).json()
    assert st["percent_complete"] > 40
    client.put("/api/v1/students/me/onboarding/goals", headers=kid, json={"skills_to_learn": ["Python"]})
    assert client.put("/api/v1/students/me/onboarding/guardian", headers=kid, json={"action": "skip_adult"}).status_code == 403
    st = client.put("/api/v1/students/me/onboarding/guardian", headers=kid, json={"action": "invite"}).json()
    invite = st["guardian_invite_code"]
    done = client.post("/api/v1/students/me/onboarding/complete", headers=kid).json()
    assert done["completed"] is True
    assert client.get("/api/v1/students/me", headers=kid).json()["hobbies"] == ["chess", "drawing"]

    # --- new student: insufficient evidence, no promising domains ---
    recs = client.post("/api/v1/recommendations/generate", headers=kid).json()
    assert recs["status"] == "insufficient_data" and recs["promising_domains"] == []
    assert any(i["kind"] == "explore_domain" for i in recs["items"])

    # --- parent registers, links, grants consent ---
    r = client.post("/api/v1/auth/register/guardian", json={"full_name": "Journey Parent", "email": unique_email("par"),
                                                             "password": "Passw0rd!", "student_invite_code": invite})
    parent = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/v1/guardians/me/children", headers=parent).json()[0]["id"] == sid
    r = client.post(f"/api/v1/guardians/children/{sid}/consents", headers=parent,
                    json={"consent_type": "data_processing", "granted": True})
    assert r.json()["consent_status"] == "granted"

    # --- activity: submit, mentor evaluates with rubric ---
    acts = client.get(f"/api/v1/activities?domain_id={stem['id']}&page_size=50", headers=kid).json()["items"]
    act = next(a for a in acts if a["submission_type"] in ("text", "mixed"))
    sub = client.post("/api/v1/submissions", headers=kid, json={"activity_id": act["id"], "content_text": "My answer <b>bold</b>",
                                                               "reflection": "Fun!"}).json()
    assert sub["status"] == "submitted"
    # cannot resubmit while pending
    assert client.post("/api/v1/submissions", headers=kid, json={"activity_id": act["id"], "content_text": "x"}).status_code == 422

    mentor = as_user("principal")  # institution admin can evaluate own-institution students
    rubric = act["rubric"]["criteria"]
    bad = client.post(f"/api/v1/evaluations/submissions/{sub['id']}", headers=mentor,
                      json={"criteria_scores": {rubric[0]["key"]: 999}})
    assert bad.status_code == 422
    scores = {c["key"]: c["max_points"] * 0.6 for c in rubric}
    ev1 = client.post(f"/api/v1/evaluations/submissions/{sub['id']}", headers=mentor,
                      json={"criteria_scores": scores, "feedback": "Nice start"}).json()
    assert ev1["normalized_score"] == 60.0
    scores2 = {c["key"]: c["max_points"] * 0.8 for c in rubric}
    client.post(f"/api/v1/evaluations/submissions/{sub['id']}", headers=mentor, json={"criteria_scores": scores2})
    detail = client.get(f"/api/v1/submissions/{sub['id']}", headers=kid).json()
    assert len(detail["evaluations"]) == 2  # history kept
    assert [e["is_current"] for e in detail["evaluations"]] == [True, False]

    # --- assessment: answers hidden, auto-graded, attempts limited ---
    asms = client.get(f"/api/v1/assessments?domain_id={stem['id']}", headers=kid).json()["items"]
    quiz = next(a for a in asms if a["type"] == "multiple_choice")
    att = client.post(f"/api/v1/assessments/{quiz['id']}/attempts", headers=kid).json()
    assert all("correct_answer" not in q for q in att["questions"])
    answers = [{"question_id": q["id"], "answer": "a"} for q in att["questions"]]
    res = client.post(f"/api/v1/assessments/attempts/{att['id']}/submit", headers=kid, json={"answers": answers}).json()
    assert res["status"] == "evaluated" and res["normalized_score"] is not None
    assert res["review"]  # explanations after evaluation

    # --- progress & scores keep interest and skill separate ---
    scores = client.get("/api/v1/analytics/domain-scores", headers=kid).json()
    stem_score = next(s for s in scores if s["domain_id"] == stem["id"])
    assert stem_score["interest_score"] is not None and stem_score["evidence_count"] >= 2
    other = next(s for s in scores if s["domain_id"] != stem["id"])
    assert other["skill_score"] is None and any("not a weakness" in e for e in other["explanation"])
    prog = client.get("/api/v1/progress/summary", headers=kid).json()
    assert prog["overall"]["evidence_count"] >= 2
    assert client.get("/api/v1/progress/timeline?period=weekly", headers=kid).status_code == 200

    # --- portfolio: private by default, link sharing needs guardian approval ---
    assert client.post(f"/api/v1/submissions/{sub['id']}/portfolio", headers=kid).status_code == 201
    pf = client.get("/api/v1/portfolios", headers=kid).json()
    assert pf["visibility"] == "private" and len(pf["items"]) == 1
    r = client.patch("/api/v1/portfolios/me", headers=kid, json={"visibility": "link"})
    assert r.status_code == 403
    client.post(f"/api/v1/portfolios/{sid}/guardian-approval?approved=true", headers=parent)
    token = client.patch("/api/v1/portfolios/me", headers=kid, json={"visibility": "link"}).json()["share_token"]
    public = client.get(f"/api/v1/portfolios/shared/{token}").json()
    assert public["student_name"] == "Journey" and public["share_token"] is None

    # --- roadmap ---
    rm = client.post("/api/v1/roadmaps/generate", headers=kid, json={"horizon_days": 30}).json()
    assert rm["milestones"] and rm["objectives"]
    m = rm["milestones"][0]
    rm2 = client.patch(f"/api/v1/roadmaps/milestones/{m['id']}", headers=kid, json={"status": "done"}).json()
    assert rm2["progress_percent"] > 0
    rm3 = client.post(f"/api/v1/roadmaps/{rm['id']}/milestones", headers=kid, json={"title": "My own goal", "due_day": 10}).json()
    assert any(x["is_custom"] for x in rm3["milestones"])

    # --- parent monitors ---
    ov = client.get(f"/api/v1/guardians/children/{sid}/overview", headers=parent).json()
    assert ov["recent_activity"] and ov["mentor_feedback"]
    rep = client.post("/api/v1/reports/generate", headers=parent, json={"student_id": sid, "kind": "parent"}).json()
    assert rep["generated_by"] == "engine" and rep["content"]["sections"]

    # --- gamification ---
    g = client.get("/api/v1/achievements", headers=kid).json()
    assert g["xp"] > 0 and any(a["earned"] for a in g["achievements"])
    dash = client.get("/api/v1/students/me/dashboard", headers=kid).json()
    assert dash["selected_domains"] and dash["stats"]["activities_completed"] == 1

    # --- interest evolution ---
    client.put("/api/v1/interests/me", headers=kid, json={"selections": [{"domain_id": domains[1]["id"], "strength": 4}]})
    evo = client.get("/api/v1/interests/evolution", headers=kid).json()
    assert evo["change_count"] >= 3 and evo["initial_domain_ids"] == [stem["id"]]


def test_demo_patterns(client, as_user):
    def recs(name):
        h = as_user(name)
        return client.get("/api/v1/recommendations", headers=h).json(), client.get("/api/v1/progress/summary", headers=h).json()

    rohan, _ = recs("rohan")
    assert rohan["status"] == "insufficient_data"
    kabir, _ = recs("kabir")
    assert kabir["status"] == "ok" and len(kabir["focus_domains"]) == 2
    diya, dprog = recs("diya")
    aarav, aprog = recs("aarav")
    assert dprog["overall"]["improvement_points"] > aprog["overall"]["improvement_points"]
    assert aprog["overall"]["initial_performance"] > dprog["overall"]["initial_performance"]


def test_student_can_disagree_and_mentor_review(client, as_user):
    kabir = as_user("kabir")
    items = client.get("/api/v1/recommendations", headers=kabir).json()["items"]
    target = next(i for i in items if i["kind"] in ("focus_domain", "promising_domain"))
    r = client.post(f"/api/v1/recommendations/{target['id']}/respond", headers=kabir,
                    json={"status": "disagreed", "response": "I prefer sports"})
    assert r.json()["status"] == "disagreed"
    mentor = as_user("mentor")
    queue = client.get("/api/v1/mentors/me/review-queue", headers=mentor).json()
    assert any(x["id"] == target["id"] for x in queue["recommendations"])
    r = client.post(f"/api/v1/recommendations/{target['id']}/review", headers=mentor,
                    json={"mentor_review_status": "adjusted", "mentor_note": "Let's explore sports too."})
    assert r.json()["mentor_review_status"] == "adjusted"


def test_assessment_attempt_limits(client, as_user):
    from conftest import register_student
    kid, _ = register_student(client, age=14)
    asm = client.get("/api/v1/assessments?page_size=50", headers=kid).json()["items"]
    quiz = next(a for a in asm if a["type"] == "multiple_choice" and a["max_attempts"] <= 3)
    for _ in range(quiz["max_attempts"]):
        att = client.post(f"/api/v1/assessments/{quiz['id']}/attempts", headers=kid).json()
        client.post(f"/api/v1/assessments/attempts/{att['id']}/submit", headers=kid, json={"answers": []})
    r = client.post(f"/api/v1/assessments/{quiz['id']}/attempts", headers=kid)
    assert r.status_code == 422 and r.json()["error"]["code"] == "no_attempts_left"
    _ = login
