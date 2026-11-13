"""Idempotent seeding.

``seed_catalog`` loads real platform content (safe for every environment).
``seed_demo`` adds clearly-marked FICTIONAL demo people and histories for
local development and live demonstrations. All demo emails use the reserved
``pathfinder.demo`` domain and every demo report is flagged ``is_demo``.
"""

from __future__ import annotations

import random
import re
import uuid
from datetime import date, datetime, timedelta, timezone

from pathfinder_engine.scoring import normalize_score
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.security import hash_password
from ..models import (
    AcademicYear,
    Achievement,
    Activity,
    ActivityAssignment,
    AgeGroup,
    Assessment,
    AssessmentAttempt,
    AssessmentResponse,
    Batch,
    BatchMember,
    Campus,
    ConsentRecord,
    Domain,
    Enrollment,
    EvaluationRecord,
    EvaluationRubric,
    FeatureFlag,
    Guardian,
    Institution,
    InterestHistory,
    LearningResource,
    Mentor,
    MentorFeedback,
    Portfolio,
    PortfolioItem,
    ProgressEvent,
    Question,
    Report,
    SchoolClass,
    Student,
    StudentGuardian,
    StudentAchievement,
    StudentInterest,
    Subdomain,
    Submission,
    Subscription,
    SubscriptionPlan,
    SystemSetting,
    User,
)
from ..services.assessments import CATEGORY_FOR_TYPE, DIMENSION_FOR_TYPE
from ..services.gamification import check_achievements, ensure_default_goals
from ..services.recommendations import generate as generate_recommendations
from ..services.scoring import compute_scores, ensure_default_config
from . import content as C

DEMO_PASSWORD = "Demo@1234"
DEMO_DOMAIN = "pathfinder.demo"


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


# =============================== catalogue ===============================

def seed_catalog(db: Session) -> dict:
    for code, label, lo, hi, mode in C.AGE_GROUPS:
        if not db.scalar(select(AgeGroup).where(AgeGroup.code == code)):
            db.add(AgeGroup(code=code, label=label, min_age=lo, max_age=hi, ui_mode=mode, sort_order=lo))
    for i, d in enumerate(C.DOMAINS):
        dom = db.scalar(select(Domain).where(Domain.slug == d["slug"]))
        if dom is None:
            dom = Domain(slug=d["slug"], name=d["name"], tagline=d["tagline"], description=d["description"],
                         advantages=d["advantages"], skill_categories=d["skill_categories"], roadmap_template=C.ROADMAP,
                         icon=d["icon"], color=d["color"], sort_order=i)
            db.add(dom)
            db.flush()
        for j, sub in enumerate(d["subdomains"]):
            if not db.scalar(select(Subdomain).where(Subdomain.domain_id == dom.id, Subdomain.slug == _slug(sub))):
                db.add(Subdomain(domain_id=dom.id, slug=_slug(sub), name=sub, sort_order=j,
                                 description=f"{sub} within {d['name']}.", skill_categories=d["skill_categories"][:2]))
    db.flush()
    domains = {d.slug: d for d in db.scalars(select(Domain))}
    subs = {(s.domain_id, s.name): s for s in db.scalars(select(Subdomain))}

    rubrics = {}
    for key, (title, criteria) in C.RUBRICS.items():
        r = db.scalar(select(EvaluationRubric).where(EvaluationRubric.title == title, EvaluationRubric.institution_id.is_(None)))
        if r is None:
            r = EvaluationRubric(title=title, criteria=criteria)
            db.add(r)
            db.flush()
        rubrics[key] = r

    for (dslug, sub, cat, title, diff, lo, hi, mins, stype, desc, instr) in C.ACTIVITIES:
        if db.scalar(select(Activity.id).where(Activity.title == title, Activity.institution_id.is_(None))):
            continue
        dom = domains[dslug]
        db.add(Activity(title=title, domain_id=dom.id, subdomain_id=subs[(dom.id, sub)].id, category=cat, description=desc,
                        min_age=lo, max_age=hi, difficulty=diff, estimated_minutes=mins, instructions=instr,
                        evaluation_criteria=[c["label"] for c in C.RUBRICS[C.RUBRIC_FOR_CATEGORY[cat]][1]],
                        submission_type=stype, max_score=100, status="published", xp_reward=10 + diff * 10,
                        is_team=cat == "team_challenge", rubric_id=rubrics[C.RUBRIC_FOR_CATEGORY[cat]].id))

    for a in C.ASSESSMENTS:
        if db.scalar(select(Assessment.id).where(Assessment.title == a["title"], Assessment.institution_id.is_(None))):
            continue
        asm = Assessment(title=a["title"], domain_id=domains[a["domain"]].id, type=a["type"], difficulty=a["difficulty"],
                         min_age=a["min_age"], max_age=a["max_age"], time_limit_minutes=a["time_limit"],
                         max_attempts=a.get("max_attempts", 3), randomize_questions=True, scale_key=_slug(a["title"]),
                         description=f"{a['title']} - {a['type'].replace('_', ' ')} assessment.",
                         xp_reward=20 + a["difficulty"] * 10)
        for k, q in enumerate(a["questions"]):
            asm.questions.append(Question(type=q["type"], prompt=q["prompt"], options=q.get("options", []),
                                          correct_answer=q.get("correct_answer"), points=q.get("points", 1),
                                          explanation=q.get("explanation"), difficulty=q.get("difficulty", 1), sort_order=k))
        db.add(asm)

    for dslug, sub, title, url, kind, lo, hi in C.RESOURCES:
        if not db.scalar(select(LearningResource.id).where(LearningResource.title == title)):
            dom = domains[dslug]
            db.add(LearningResource(domain_id=dom.id, subdomain_id=subs[(dom.id, sub)].id, title=title, url=url,
                                    kind=kind, min_age=lo, max_age=hi))
    for code, title, desc, icon, cat, xp, crit in C.ACHIEVEMENTS:
        if not db.scalar(select(Achievement.id).where(Achievement.code == code)):
            db.add(Achievement(code=code, title=title, description=desc, icon=icon, category=cat, xp_reward=xp, criteria=crit))
    for code, name, mx, price, feats in C.PLANS:
        if not db.scalar(select(SubscriptionPlan.id).where(SubscriptionPlan.code == code)):
            db.add(SubscriptionPlan(code=code, name=name, max_students=mx, price_inr_per_year=price, features=feats))
    for key, enabled, desc in C.FEATURE_FLAGS:
        if not db.scalar(select(FeatureFlag.id).where(FeatureFlag.key == key)):
            db.add(FeatureFlag(key=key, enabled=enabled, description=desc))
    if db.get(SystemSetting, "privacy") is None:
        db.add(SystemSetting(key="privacy", value={"policy_version": "2026-01", "retention_days_after_deletion": 30,
                                                   "consent_required_under_age": 18}))
    ensure_default_config(db)
    db.flush()
    return {"domains": len(domains)}


# =============================== demo data ===============================

def _user(db: Session, email: str, name: str, role: str, inst_id=None, pw_hash: str | None = None) -> User:
    u = db.scalar(select(User).where(User.email == email))
    if u:
        return u
    u = User(email=email, full_name=name, role=role, institution_id=inst_id, password_hash=pw_hash,
             is_verified=True, preferences={"theme": "system"})
    db.add(u)
    db.flush()
    return u


# name, age, gender-neutral fictional; pattern; interests (domain slugs, favourite first)
STUDENTS = [
    ("Aarav Mehta", 15, "high_start_modest", ["stem", "science"]),
    ("Diya Nair", 13, "average_exceptional", ["stem", "science"]),
    ("Kabir Singh", 16, "creative_practical", ["creative-arts", "communication"]),
    ("Meera Iyer", 12, "changing_interests", ["creative-arts", "business"]),
    ("Rohan Das", 10, "insufficient", ["sports"]),
    ("Ananya Rao", 8, "steady", ["creative-arts", "science"]),
    ("Vihaan Kapoor", 9, "steady", ["stem", "sports"]),
    ("Ishita Banerjee", 14, "improving", ["communication", "business"]),
    ("Arjun Pillai", 17, "steady", ["business", "stem"]),
    ("Saanvi Joshi", 11, "improving", ["science", "creative-arts"]),
    ("Reyansh Gupta", 7, "steady", ["sports", "stem"]),
    ("Myra Chatterjee", 19, "creative_practical", ["creative-arts", "business"]),
    ("Advik Reddy", 20, "high_start_modest", ["stem", "business"]),
    ("Kiara Fernandes", 16, "improving", ["communication", "science"]),
    ("Ayaan Khan", 13, "steady", ["sports", "communication"]),
    ("Navya Kulkarni", 15, "average_exceptional", ["science", "stem"]),
    ("Dhruv Malhotra", 12, "insufficient", ["business"]),
    ("Tara Menon", 18, "improving", ["communication", "creative-arts"]),
    ("Yash Agarwal", 10, "steady", ["stem", "creative-arts"]),
    ("Zara Qureshi", 14, "changing_interests", ["science", "sports"]),
]


def _trajectory(pattern: str, n: int, rng: random.Random) -> list[float]:
    if pattern == "high_start_modest":
        start, end = 86, 89
    elif pattern == "average_exceptional":
        start, end = 50, 91
    elif pattern == "creative_practical":
        start, end = 78, 93
    elif pattern == "improving":
        start, end = 58, 80
    else:
        start, end = 64, 70
    if n == 1:
        return [start]
    return [max(20, min(100, start + (end - start) * i / (n - 1) + rng.uniform(-4, 4))) for i in range(n)]


def seed_demo(db: Session, now: datetime | None = None) -> dict:
    if db.scalar(select(User.id).where(User.email == f"superadmin@{DEMO_DOMAIN}")):
        return {"skipped": "demo data already present"}
    rng = random.Random(2026)
    now = now or datetime.now(timezone.utc)
    pw = hash_password(DEMO_PASSWORD)
    domains = {d.slug: d for d in db.scalars(select(Domain))}

    inst = Institution(name="Green Valley Public School (Demo)", code="GVPS-DEMO", kind="school",
                       address="Fictional campus, Bengaluru", contact_email=f"office@{DEMO_DOMAIN}", is_active=True)
    db.add(inst)
    db.flush()
    campus = Campus(institution_id=inst.id, name="Main Campus")
    year = AcademicYear(institution_id=inst.id, label="2026-27", starts_on=date(2026, 6, 1), ends_on=date(2027, 3, 31),
                        is_current=True)
    db.add_all([campus, year])
    db.add(Subscription(institution_id=inst.id, plan_code="standard", status="active", seats=500, starts_on=date(2026, 6, 1)))
    db.flush()

    _user(db, f"superadmin@{DEMO_DOMAIN}", "Sana Kapoor (Super Admin)", "super_admin", pw_hash=pw)
    _user(db, f"admin@{DEMO_DOMAIN}", "Rahul Verma (Platform Admin)", "platform_admin", pw_hash=pw)
    principal = _user(db, f"principal@{DEMO_DOMAIN}", "Dr. Lakshmi Krishnan", "institution_admin", inst.id, pw)
    db.add(Mentor(user_id=principal.id, kind="teacher", institution_id=inst.id))
    mentor_u = _user(db, f"mentor@{DEMO_DOMAIN}", "Ananya Sharma", "mentor", inst.id, pw)
    teacher_u = _user(db, f"teacher@{DEMO_DOMAIN}", "Vikram Joshi", "teacher", inst.id, pw)
    mentor = Mentor(user_id=mentor_u.id, kind="mentor", institution_id=inst.id, bio="STEM & creative arts mentor.",
                    expertise_domain_ids=[str(domains["stem"].id), str(domains["creative-arts"].id)])
    teacher = Mentor(user_id=teacher_u.id, kind="teacher", institution_id=inst.id, bio="Science and sports teacher.",
                     expertise_domain_ids=[str(domains["science"].id), str(domains["sports"].id)])
    db.add_all([mentor, teacher])
    db.flush()
    classes = {}
    for grade in ("3", "5", "7", "9", "11", "UG"):
        c = SchoolClass(institution_id=inst.id, campus_id=campus.id, academic_year_id=year.id, name=f"Grade {grade} A",
                        grade=grade, section="A", class_teacher_id=teacher.id)
        db.add(c)
        classes[grade] = c
    db.flush()
    batch_a = Batch(mentor_id=mentor.id, institution_id=inst.id, name="Innovators (STEM & Arts)")
    batch_b = Batch(mentor_id=teacher.id, institution_id=inst.id, name="Explorers (Science & Sports)")
    db.add_all([batch_a, batch_b])
    db.flush()

    parent_u = _user(db, f"parent@{DEMO_DOMAIN}", "Priya Mehta", "guardian", pw_hash=pw)
    parent = Guardian(user_id=parent_u.id, occupation="Architect")
    db.add(parent)
    parent2_u = _user(db, f"parent2@{DEMO_DOMAIN}", "Suresh Iyer", "guardian", pw_hash=pw)
    parent2 = Guardian(user_id=parent2_u.id)
    db.add(parent2)
    db.flush()

    activities = list(db.scalars(select(Activity).where(Activity.institution_id.is_(None))))
    assessments = list(db.scalars(select(Assessment).where(Assessment.institution_id.is_(None),
                                                           Assessment.type != "self_reflection")))
    students: list[Student] = []
    for idx, (name, age, pattern, interests) in enumerate(STUDENTS, start=1):
        first = name.split()[0].lower()
        u = _user(db, f"{first}@{DEMO_DOMAIN}", name, "student", inst.id, pw)
        dob = date(now.year - age, ((idx * 5) % 12) + 1, ((idx * 7) % 27) + 1)
        if (dob.month, dob.day) > (now.month, now.day):
            dob = dob.replace(year=dob.year - 0)
        ag = db.scalar(select(AgeGroup).where(AgeGroup.min_age <= age, AgeGroup.max_age >= age))
        grade = "3" if age <= 8 else "5" if age <= 11 else "7" if age <= 13 else "9" if age <= 15 else "11" if age <= 17 else "UG"
        s = Student(user_id=u.id, institution_id=inst.id, date_of_birth=dob, age_group_id=ag.id if ag else None,
                    school_name=inst.name, grade=grade, class_name=classes[grade].name,
                    favourite_subjects=rng.sample(["Maths", "Science", "English", "Art", "History", "PE", "Computers"], 2),
                    hobbies=rng.sample(["Drawing", "Football", "Reading", "Gaming", "Music", "Cooking", "Cycling"], 2),
                    personal_interests=[domains[i].name for i in interests],
                    self_reported_strengths=rng.sample(["Curious", "Creative", "Patient", "Team player", "Organised"], 2),
                    skills_to_learn=rng.sample(["Python", "Public speaking", "Drawing", "Budgeting", "Experiments", "Fitness"], 2),
                    aspirations="Find what I love and get really good at it.",
                    learning_preferences=rng.sample(["hands_on", "visual", "reading", "collaborative"], 2),
                    onboarding_steps_completed=["account", "academic", "interests", "goals", "guardian"],
                    onboarding_completed_at=now - timedelta(days=95), consent_status="granted" if age < 18 else "not_required",
                    guardian_invite_code=f"DEMO{idx:04d}", created_at=now - timedelta(days=100))
        db.add(s)
        db.flush()
        db.add(Enrollment(student_id=s.id, class_id=classes[grade].id, academic_year_id=year.id))
        db.add(BatchMember(batch_id=(batch_a if interests[0] in ("stem", "creative-arts", "business", "communication") else batch_b).id,
                           student_id=s.id))
        if idx in (1, 3):  # mentor sees a couple of students across both batches
            db.add(BatchMember(batch_id=batch_b.id, student_id=s.id))
        guardian = parent if idx in (1, 6) else parent2 if idx == 4 else None
        if guardian:
            db.add(StudentGuardian(student_id=s.id, guardian_id=guardian.id, relationship_type="parent", status="active",
                                   linked_at=now - timedelta(days=99)))
            for ct in ("data_processing", "ai_processing", "communications", "mentor_access"):
                db.add(ConsentRecord(student_id=s.id, guardian_id=guardian.id, granted_by_user_id=guardian.user_id,
                                     consent_type=ct, granted=True, created_at=now - timedelta(days=99)))
        elif age < 18:
            db.add(ConsentRecord(student_id=s.id, consent_type="data_processing", granted=True, method="school_form",
                                 created_at=now - timedelta(days=99)))

        # ---- interests (preference) + evolution history ----
        start = now - timedelta(days=95)
        initial = interests if pattern != "changing_interests" else (["sports"] if idx == 4 else ["creative-arts"])
        for slug in initial:
            db.add(InterestHistory(student_id=s.id, domain_id=domains[slug].id, action="added", source="onboarding",
                                   new_value={"strength": 4}, created_at=start))
        if pattern == "changing_interests":
            for k, slug in enumerate(interests):
                db.add(InterestHistory(student_id=s.id, domain_id=domains[slug].id, action="explored", source="exploration",
                                       new_value={"first_time": True}, created_at=start + timedelta(days=20 + k * 10)))
                db.add(InterestHistory(student_id=s.id, domain_id=domains[slug].id, action="added", source="self",
                                       new_value={"strength": 4}, created_at=start + timedelta(days=30 + k * 10)))
            for slug in initial:
                if slug not in interests:
                    db.add(InterestHistory(student_id=s.id, domain_id=domains[slug].id, action="removed", source="self",
                                           old_value={"strength": 4}, created_at=start + timedelta(days=50)))
        for k, slug in enumerate(interests):
            db.add(StudentInterest(student_id=s.id, domain_id=domains[slug].id, strength=5 - k, is_favourite=k == 0,
                                   source="onboarding" if slug in initial else "self"))
            sub = db.scalar(select(Subdomain).where(Subdomain.domain_id == domains[slug].id).order_by(Subdomain.sort_order))
            db.add(StudentInterest(student_id=s.id, domain_id=domains[slug].id, subdomain_id=sub.id, strength=4, source="self"))

        portfolio = Portfolio(student_id=s.id, title=f"{name.split()[0]}'s Portfolio",
                              bio="Demo portfolio - fictional student.", visibility="guardians")
        db.add(portfolio)
        db.flush()

        # ---- evidence histories ----
        n_items = 1 if pattern == "insufficient" else rng.randint(9, 14)
        eligible = [a for a in activities if a.min_age <= age <= a.max_age]
        focus = [a for a in eligible if a.domain.slug in interests]
        other = [a for a in eligible if a.domain.slug not in interests]
        scores = _trajectory(pattern, n_items, rng)
        chosen_acts = (focus * 3)[:max(1, int(n_items * 0.7))]
        rng.shuffle(chosen_acts)
        chosen_acts += rng.sample(other, min(len(other), n_items - len(chosen_acts)))
        evaluators = [mentor_u, teacher_u]
        attempt_counter: dict = {}
        for k, act in enumerate(chosen_acts[:n_items]):
            when = start + timedelta(days=int(5 + k * (85 / max(n_items, 1))), hours=rng.randint(8, 18))
            pct = round(scores[k], 1)
            if pattern == "creative_practical" and act.domain.slug == "creative-arts":
                pct = min(100, pct + 3)
            attempt_no = attempt_counter.get(act.id, 0) + 1
            attempt_counter[act.id] = attempt_no
            assignment = db.scalar(select(ActivityAssignment).where(ActivityAssignment.activity_id == act.id,
                                                                    ActivityAssignment.student_id == s.id))
            if assignment is None:
                assignment = ActivityAssignment(activity_id=act.id, student_id=s.id, is_voluntary=k % 3 == 0,
                                                assigned_by=None if k % 3 == 0 else mentor_u.id, status="completed",
                                                created_at=when - timedelta(days=2))
                db.add(assignment)
                db.flush()
            sub = Submission(activity_id=act.id, student_id=s.id, assignment_id=assignment.id, attempt_no=attempt_no,
                             content_text=f"[Demo submission] My work on '{act.title}'.", status="evaluated",
                             reflection="I learned something new and want to try a harder version.",
                             self_rating=rng.randint(3, 5), submitted_at=when, created_at=when)
            db.add(sub)
            db.flush()
            rubric = act.rubric
            crit_scores = {c["key"]: round(c["max_points"] * pct / 100, 1) for c in rubric.criteria}
            dims: dict[str, list[float]] = {}
            for c in rubric.criteria:
                if c["dimension"] != "performance":
                    dims.setdefault(c["dimension"], []).append(pct)
            dim_scores = {k2: round(sum(v) / len(v), 1) for k2, v in dims.items()}
            evaluator = evaluators[k % 2]
            validated = pattern != "insufficient"
            quality = 0.8 if pattern == "creative_practical" else 0.6
            db.add(EvaluationRecord(submission_id=sub.id, evaluator_user_id=evaluator.id, rubric_id=rubric.id,
                                    criteria_scores=crit_scores, dimension_scores=dim_scores,
                                    total_score=sum(crit_scores.values()), max_score=rubric.max_points,
                                    normalized_score=pct, evidence_quality=quality,
                                    feedback="Good effort - clear thinking. Next time explain your choices in more detail.",
                                    created_at=when + timedelta(days=1)))
            is_project = act.category in ("practical_project", "research_task")
            db.add(ProgressEvent(student_id=s.id, domain_id=act.domain_id, subdomain_id=act.subdomain_id,
                                 event_type="activity_submitted" if not is_project else "project_submitted",
                                 source_type="submission", source_id=sub.id, category=act.category,
                                 difficulty=act.difficulty, payload={"title": act.title}, occurred_at=when))
            db.add(ProgressEvent(student_id=s.id, domain_id=act.domain_id, subdomain_id=act.subdomain_id,
                                 event_type="project_submitted" if is_project else "activity_completed",
                                 source_type="submission", source_id=sub.id,
                                 evidence_kind="project" if is_project else "activity", category=act.category,
                                 score_pct=pct, scale_key=f"activity:{act.id}", difficulty=act.difficulty,
                                 attempt_no=attempt_no, mentor_validated=validated, evidence_quality=quality,
                                 dimension_scores=dim_scores, payload={"title": act.title},
                                 occurred_at=when + timedelta(days=1)))
            if k < 3 or is_project:
                db.add(PortfolioItem(portfolio_id=portfolio.id, title=act.title, submission_id=sub.id,
                                     description="Demo portfolio item from an evaluated activity.",
                                     category={"coding_challenge": "coding_project", "research_task": "research_project",
                                               "creative_assignment": "creative_work"}.get(act.category, "document"),
                                     domain_ids=[str(act.domain_id)], created_on=when.date(), is_featured=k == 0,
                                     mentor_feedback="Lovely work - keep it up!"))
            s.xp += act.xp_reward

        # Advanced practical validation for the creative/practical pattern (difficulty 4, mentor validated)
        if pattern == "creative_practical":
            for slug in interests[:2]:
                adv = next((a for a in eligible if a.domain.slug == slug and a.difficulty >= 4), None)
                if adv:
                    when = now - timedelta(days=6)
                    sub = Submission(activity_id=adv.id, student_id=s.id, attempt_no=1, status="evaluated",
                                     content_text="[Demo] Advanced practical project.", submitted_at=when)
                    db.add(sub)
                    db.flush()
                    db.add(ProgressEvent(student_id=s.id, domain_id=adv.domain_id, event_type="project_submitted",
                                         source_type="submission", source_id=sub.id, evidence_kind="project",
                                         category=adv.category, score_pct=91.0, scale_key=f"activity:{adv.id}",
                                         difficulty=adv.difficulty, mentor_validated=True, evidence_quality=0.9,
                                         dimension_scores={"creativity": 93.0, "problem_solving": 88.0},
                                         payload={"title": adv.title}, occurred_at=when))

        # Repeated (comparable) assessments show learning progress within the same scale.
        if pattern != "insufficient":
            fitting = [a for a in assessments if a.min_age <= age <= a.max_age and a.domain.slug in interests]
            for asm in fitting[:2]:
                reps = 3 if pattern in ("average_exceptional", "improving") else 2
                traj = _trajectory(pattern, reps, rng)
                for r in range(reps):
                    when = start + timedelta(days=15 + r * 30, hours=10)
                    q = [x for x in asm.questions if x.auto_gradable]
                    if not q:
                        continue
                    right = round(len(q) * traj[r] / 100)
                    att = AssessmentAttempt(assessment_id=asm.id, student_id=s.id, attempt_no=r + 1,
                                            question_ids=[str(x.id) for x in q], started_at=when,
                                            submitted_at=when + timedelta(minutes=8), status="evaluated",
                                            raw_score=float(right), max_score=float(len(q)),
                                            normalized_score=normalize_score(right, len(q)))
                    db.add(att)
                    db.flush()
                    for qi, x in enumerate(q):
                        ok = qi < right
                        db.add(AssessmentResponse(attempt_id=att.id, question_id=x.id,
                                                  answer=x.correct_answer if ok else None, is_correct=ok,
                                                  points_awarded=x.points if ok else 0))
                    dim = DIMENSION_FOR_TYPE.get(asm.type)
                    db.add(EvaluationRecord(attempt_id=att.id, total_score=right, max_score=len(q),
                                            normalized_score=att.normalized_score, is_auto=True, evidence_quality=0.4,
                                            dimension_scores={dim: att.normalized_score} if dim else {}))
                    db.add(ProgressEvent(student_id=s.id, domain_id=asm.domain_id, event_type="assessment_completed",
                                         source_type="assessment_attempt", source_id=att.id, evidence_kind="assessment",
                                         category=CATEGORY_FOR_TYPE.get(asm.type, "knowledge_quiz"),
                                         score_pct=att.normalized_score, scale_key=asm.scale_key, difficulty=asm.difficulty,
                                         attempt_no=r + 1, evidence_quality=0.4,
                                         dimension_scores={dim: att.normalized_score} if dim else {},
                                         payload={"title": asm.title}, occurred_at=when + timedelta(minutes=8)))
                    s.xp += asm.xp_reward

        db.add(MentorFeedback(mentor_user_id=mentor_u.id, student_id=s.id, domain_id=domains[interests[0]].id,
                              kind="observation", created_at=now - timedelta(days=4),
                              content=("Shows real curiosity and asks thoughtful questions. Encourage more "
                                       "practice on explaining their reasoning.") if pattern != "insufficient" else
                                      "Has just started - let's try a few more activities before drawing conclusions."))
        s.current_streak = 0 if pattern == "insufficient" else rng.randint(1, 9)
        s.longest_streak = max(s.current_streak, rng.randint(3, 12)) if pattern != "insufficient" else 1
        s.last_active_on = (now - timedelta(days=0 if s.current_streak else 5)).date()
        students.append(s)
    db.flush()

    for s in students:
        ensure_default_goals(db, s)
        check_achievements(db, s)
        # Demo badges belong to the simulated history, not to "now".
        db.flush()
        last = db.scalar(select(ProgressEvent.occurred_at).where(
            ProgressEvent.student_id == s.id, ProgressEvent.event_type != "achievement_unlocked")
            .order_by(ProgressEvent.occurred_at.desc())) or now - timedelta(days=3)
        for k, ev in enumerate(db.scalars(select(ProgressEvent).where(
                ProgressEvent.student_id == s.id, ProgressEvent.event_type == "achievement_unlocked")).all()):
            ev.occurred_at = last - timedelta(days=2 + k * 6)
        for k, sa in enumerate(db.scalars(select(StudentAchievement).where(StudentAchievement.student_id == s.id)).all()):
            sa.awarded_at = last - timedelta(days=2 + k * 6)
        compute_scores(db, s)
        generate_recommendations(db, s)

    # AI-generated example reports, clearly flagged as demonstrations
    for s in students[:5]:
        db.add(Report(student_id=s.id, institution_id=inst.id, kind="parent", is_demo=True, generated_by="demo",
                      period_start=(now - timedelta(days=30)).date(), period_end=now.date(),
                      title=f"[DEMO] {s.user.first_name}'s monthly progress report",
                      content={"label": "DEMONSTRATION REPORT - example of AI-generated output, fictional student.",
                               "sections": [
                                   {"title": "Overview", "body": f"{s.user.first_name} stayed active this month and completed several activities in their chosen interests."},
                                   {"title": "Strengths shown", "body": "Careful planning and creative ideas were visible in recent submissions."},
                                   {"title": "How you can help", "body": "Ask which activity they enjoyed most and encourage one new domain next month."},
                               ]}))
    db.flush()
    return {"students": len(students), "institution": inst.code, "password": DEMO_PASSWORD}


_ = uuid  # noqa
