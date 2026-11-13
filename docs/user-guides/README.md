# User guides

Demo accounts (local/demo data only - all fictional, password `Demo@1234`):

| Role | Email |
|---|---|
| Super admin | superadmin@pathfinder.demo |
| Platform admin | admin@pathfinder.demo |
| Institution admin | principal@pathfinder.demo |
| Mentor | mentor@pathfinder.demo |
| Teacher | teacher@pathfinder.demo |
| Parent (Aarav, Ananya) | parent@pathfinder.demo |
| Parent (Meera) | parent2@pathfinder.demo |
| Students | aarav, diya, kabir, meera, rohan, ananya, ... `@pathfinder.demo` |

Demo student patterns: **Aarav** (high start, modest improvement), **Diya** (average start, exceptional improvement),
**Kabir** (strong creative and validated practical work - two focus domains), **Meera** (changing interests),
**Rohan** (insufficient evidence - recommendations stay in "keep exploring" mode), **Ananya** (age 8, junior interface).

## Students

1. **Sign up** at `/register` with your date of birth. Under 18? Share the invite code shown in onboarding with a parent.
2. **Onboarding** (5 steps): academic profile, interests (pick domains and subdomains, star a favourite), goals, guardian step, finish.
3. **Dashboard**: daily activities from your chosen domains, weekly goals, progress chart, suggestions and milestones.
4. **Six Domains / Interest Discovery**: browse freely, take the questionnaire for suggestions, change interests whenever you like. The *Interest evolution* tab shows how your interests changed.
5. **Activity Centre**: open an activity, follow instructions, submit text / link / files and an optional reflection. A mentor reviews it with a rubric.
6. **Assessments**: timed or untimed; answers autosave. Choice questions are graded instantly; written answers are reviewed by a mentor.
7. **Progress**: initial vs current performance on *repeated* work, consistency, interest vs demonstrated skill, and a breakdown of how each domain score is calculated.
8. **Recommendations**: every suggestion explains why. You can accept, dismiss or disagree - disagreeing is respected and shared with your mentor.
9. **Roadmap**: generate a 7/30/90/180-day plan, tick off milestones, add your own steps.
10. **Portfolio**: private by default. Add reviewed work or uploads; link sharing for under-18s needs guardian approval.
11. **AI Assistant**: guidance grounded in your records, always labelled. If AI is off or consent is missing, a rule-based helper answers.

## Parents / guardians

- Register at `/register?as=guardian` with your child's invite code, or link later from **My children**.
- **Consent & privacy** tab: grant or withdraw data processing, AI processing, mentor access, communications and portfolio sharing. Every change is recorded.
- **Overview / Progress / Portfolio / Reports** tabs show authorised records only. Generate weekly, monthly or parent-friendly reports.
- **Messages**: talk to your child's mentors.

## Mentors and teachers

- **Batches**: group students; assign activities to a batch or individuals with due dates.
- **Review queue**: evaluate submissions with rubric sliders (each criterion feeds a scoring dimension), set evidence quality, validate practical work, return for revision. Grade open-ended assessment answers.
- **Student profile**: domain performance with explanations, feedback/observations, AI insights (evidence-cited), recommendation review (approve/adjust/reject), development plans.
- **Activities / Assessments**: create content for your institution.

## Institution administrators

- **Overview**: aggregate interest, participation and skill per domain (never per-student rankings).
- **Campuses & Classes**: campuses, academic years, classes; distribute an activity to a whole class.
- **Staff & Students**: add teachers/mentors, import students by CSV (`full_name,email,date_of_birth,grade`), allocate students to mentors.
- **Reports & subscription**: institutional participation reports, plan and seat usage.

## Platform and super administrators

- Users, institutions (approve/suspend, plans), domains & subdomains, broadcast notifications.
- Super admin: versioned scoring weights, AI provider settings & token usage, feature flags, audit/security logs, system health.
