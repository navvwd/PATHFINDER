/**
 * Student-first learning pages: Home, My Courses, My Tasks, Live Sessions, My Progress, My Profile.
 * Plain language, one primary action per card, brand colours only. Status is always
 * shown with an icon + text label, never colour alone.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Course, LiveSession, StudentTasks, StudentWeek, TaskItem } from "@pathfinder/api-client";
import {
  AlarmClock, ArrowRight, Award, BookOpen, CalendarDays, Check, CheckCircle2, CircleDashed, Clock, Flame, Hourglass, ListChecks,
  MapPin, MessageSquare, PlayCircle, Sparkles, Star, Target, TrendingUp, Trophy, UserRound, Video, XCircle,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { ProgressPanel } from "./Progress";
import {
  Avatar, Badge, Button, Card, CardBody, CardHeader, cx, EmptyState, PageHeader, ProgressBar, QueryState, Skeleton, Tabs, Textarea, useToast,
} from "@/components/ui";
import { api, useAuth } from "@/lib/auth";
import { fmtDate, relTime } from "@/lib/format";

// ------------------------------------------------------------------ small building blocks

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const whenLabel = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86_400_000);
  if (diff === 0) return `Today, ${timeLabel(iso)}`;
  if (diff === 1) return `Tomorrow, ${timeLabel(iso)}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${timeLabel(iso)}`;
};
const dueLabel = (t: TaskItem) => {
  if (!t.due_at) return t.type === "assessment" ? "Quiz in progress" : "No deadline";
  const days = Math.ceil((new Date(t.due_at).getTime() - Date.now()) / 86_400_000);
  if (t.overdue) return `Overdue by ${Math.abs(days) || 1} day${Math.abs(days) === 1 ? "" : "s"}`;
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
};
const taskHref = (t: TaskItem) => (t.type === "assessment" ? `/app/assessments/${t.id}/take` : `/app/activities/${t.id}`);

/** Circular progress (percent) with a visible number - colour is never the only cue. */
export function Ring({ value, size = 64, label }: { value: number; size?: number; label: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${v}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pf-surface-muted)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pf-primary)" strokeWidth={6} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} />
      </svg>
      <span className="num absolute inset-0 grid place-items-center text-sm font-semibold">{v}%</span>
    </div>
  );
}

/** Seven-day activity strip. */
function WeekStrip({ days }: { days: StudentWeek["days"] }) {
  const max = Math.max(1, ...days.map((d) => d.actions));
  const todayIso = new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-end justify-between gap-1.5" role="img"
      aria-label={`Learning actions in the last 7 days: ${days.map((d) => `${dayLabel(d.date)} ${d.actions}`).join(", ")}`}>
      {days.map((d) => (
        <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="flex h-16 w-full items-end rounded-lg bg-muted">
            <div className={cx("w-full rounded-lg", d.actions ? "bg-primary" : "")} style={{ height: `${d.actions ? Math.max(14, (d.actions / max) * 100) : 0}%` }} />
          </div>
          <span className={cx("text-[11px]", d.date === todayIso ? "font-semibold text-ink" : "text-subtle")}>{dayLabel(d.date)}</span>
        </div>
      ))}
    </div>
  );
}

const ATTENDANCE: Record<string, { label: string; icon: ReactNode; tone: "success" | "warning" | "danger" | "neutral" }> = {
  present: { label: "Attended", icon: <CheckCircle2 className="size-3.5" />, tone: "success" },
  late: { label: "Joined late", icon: <AlarmClock className="size-3.5" />, tone: "warning" },
  absent: { label: "Missed", icon: <XCircle className="size-3.5" />, tone: "danger" },
  excused: { label: "Excused", icon: <Check className="size-3.5" />, tone: "neutral" },
  pending: { label: "Not marked yet", icon: <CircleDashed className="size-3.5" />, tone: "neutral" },
};
export const AttendanceBadge = ({ mark }: { mark: string }) => {
  const a = ATTENDANCE[mark] ?? ATTENDANCE.pending!;
  return <Badge tone={a.tone}><span className="inline-flex items-center gap-1">{a.icon}{a.label}</span></Badge>;
};

export function SessionCard({ s, compact, showLink = true }: { s: LiveSession; compact?: boolean; showLink?: boolean }) {
  const d = new Date(s.starts_at);
  return (
    <div className={cx("flex gap-4 rounded-2xl border border-line bg-surface", compact ? "p-3" : "p-4")}>
      <div className="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-muted py-2 leading-none">
        <span className="eyebrow text-[10px] text-subtle">{d.toLocaleDateString(undefined, { month: "short" })}</span>
        <span className="num mt-1 text-2xl font-bold">{d.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{s.title}</span>
          {s.phase === "live" && <Badge tone="primary"><span className="inline-flex items-center gap-1"><span className="size-1.5 animate-pulse rounded-full bg-primary" />Live now</span></Badge>}
          {s.phase === "cancelled" && <Badge tone="danger">Cancelled</Badge>}
          {s.my_attendance && s.phase === "past" && <AttendanceBadge mark={s.my_attendance} />}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-subtle">
          <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{whenLabel(s.starts_at)} · {s.duration_minutes} min</span>
          {s.mentor_name && <span className="inline-flex items-center gap-1"><UserRound className="size-3.5" />{s.mentor_name}</span>}
          {s.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{s.location}</span>}
        </div>
        {!compact && s.description && <p className="mt-2 text-sm">{s.description}</p>}
      </div>
      {showLink && s.phase !== "past" && s.phase !== "cancelled" && (
        <div className="self-center">
          {s.can_join && s.meeting_url
            ? <a href={s.meeting_url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="accent" icon={<Video className="size-4" />}>Join</Button></a>
            : (s.meeting_url === null && s.location) || compact ? null
            : <span className="hidden text-right text-xs text-subtle sm:block">Join link opens<br />15 min before</span>}
        </div>
      )}
    </div>
  );
}

function TaskRow({ t }: { t: TaskItem }) {
  return (
    <Link to={taskHref(t)} className="flex items-center gap-3 rounded-xl border border-line p-3 transition hover:bg-muted">
      <span className={cx("grid size-9 shrink-0 place-items-center rounded-full", t.overdue ? "bg-danger-soft text-danger" : "bg-muted text-ink")}>
        {t.overdue ? <AlarmClock className="size-4" aria-hidden /> : t.type === "assessment" ? <Star className="size-4" aria-hidden /> : <ListChecks className="size-4" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{t.title}</div>
        <div className={cx("text-xs", t.overdue ? "font-medium text-danger" : "text-subtle")}>
          {dueLabel(t)}{t.domain_name ? ` · ${t.domain_name}` : ""}{t.minutes ? ` · ${t.minutes} min` : ""}
        </div>
      </div>
      <ArrowRight className="size-4 text-subtle" aria-hidden />
    </Link>
  );
}

const SectionLink = ({ to, children }: { to: string; children: ReactNode }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-primary-ink hover:underline">{children}<ArrowRight className="size-3.5" /></Link>
);

function encouragement(streak: number, week: StudentWeek | undefined, tasks: StudentTasks | undefined): string {
  if (tasks?.counts.overdue) return "You have something overdue - finishing it first will feel great.";
  if (streak >= 5) return `${streak} days in a row - you're on fire! Keep the streak alive today.`;
  if (week && week.actions_this_week > week.actions_last_week && week.actions_last_week > 0) return "You've done more this week than last week. Nice momentum!";
  if (streak > 0) return "Every day counts. A short lesson today keeps your streak going.";
  return "Start small: one 15-minute activity today is a great beginning.";
}

// ------------------------------------------------------------------ Home

export function StudentHome() {
  const me = useAuth((s) => s.me)!;
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: () => api.students.dashboard() });
  const courses = useQuery({ queryKey: ["courses"], queryFn: () => api.courses() });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: () => api.tasks() });
  const week = useQuery({ queryKey: ["week"], queryFn: () => api.week() });
  const sessions = useQuery({ queryKey: ["sessions", "upcoming"], queryFn: () => api.sessions.list({ when: "upcoming", limit: 3 }) });
  const profile = useQuery({ queryKey: ["student-me"], queryFn: () => api.students.me() });

  return (
    <QueryState q={dash}>
      {(d) => {
        const st = d.stats as Record<string, number>;
        const goals = d.weekly_goals as Array<{ id: string; title: string; current: number; target: number; status: string }>;
        const goal = goals.find((g) => g.status !== "completed") ?? null;
        const cont = courses.data?.find((c) => c.next_lesson && c.next_lesson.status !== "not_started") ?? courses.data?.find((c) => c.next_lesson);
        const next = sessions.data?.[0];
        const junior = d.ui_mode === "junior";
        const p = profile.data;
        const classLine = [p?.class_name || (p?.grade ? `Grade ${p.grade}` : null), p?.school_name].filter(Boolean).join(" · ");
        return (
          <div className="space-y-6">
            {/* Welcome */}
            <section className="flex flex-col gap-5 rounded-[var(--pf-radius)] bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:p-6">
              <Avatar name={me.user.full_name} size={64} />
              <div className="min-w-0 flex-1">
                <h1 className={cx("font-bold leading-tight", junior ? "text-3xl" : "text-2xl sm:text-3xl")}>{d.greeting}</h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-subtle">
                  <span className="inline-flex items-center gap-1 font-medium text-ink"><Trophy className="size-4 text-primary-ink" aria-hidden />Level {st.level}</span>
                  {classLine && <span>{classLine}</span>}
                </p>
              </div>
              <div className="rounded-2xl bg-muted p-4 sm:w-72">
                <div className="eyebrow flex items-center gap-1.5 text-subtle"><Target className="size-3.5" aria-hidden />Today's goal</div>
                {goal ? (
                  <>
                    <div className="mt-1.5 text-sm font-semibold">{goal.title}</div>
                    <div className="mt-2 flex items-center gap-2"><ProgressBar value={goal.current} max={goal.target} label={goal.title} /><span className="num text-xs">{goal.current}/{goal.target}</span></div>
                  </>
                ) : <div className="mt-1.5 text-sm font-semibold"><CheckCircle2 className="mr-1 inline size-4 text-success" aria-hidden />All weekly goals done - amazing!</div>}
              </div>
            </section>

            {me.consent_status === "pending" ? (
              <Card className="border-warning/40 bg-warning-soft p-4 text-sm"><strong>Waiting for your parent's OK.</strong> Ask them to sign up with your invite code (in Settings). Some features, like AI help, turn on after they agree.</Card>
            ) : null}

            {/* Quick actions */}
            <nav aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { to: cont?.next_lesson ? `/app/activities/${cont.next_lesson.id}` : "/app/courses", label: "Start learning", icon: PlayCircle, primary: true },
                { to: "/app/tasks", label: "View assignments", icon: ListChecks },
                { to: "/app/sessions", label: "Join live session", icon: Video },
                { to: "/app/messages", label: "Ask my mentor", icon: MessageSquare },
                { to: "/app/achievements", label: "My achievements", icon: Award },
              ].map((a) => (
                <Link key={a.label} to={a.to} className={cx("flex items-center gap-3 rounded-2xl border p-4 text-sm font-semibold transition hover:-translate-y-0.5",
                  a.primary ? "border-transparent bg-inverse text-on-inverse" : "border-line bg-surface hover:bg-muted")}>
                  <a.icon className={cx("size-5 shrink-0", a.primary ? "text-[var(--pf-primary)]" : "text-primary-ink")} aria-hidden />{a.label}
                </Link>
              ))}
            </nav>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {/* Continue learning */}
                <Card>
                  <CardHeader title="Continue learning" action={<SectionLink to="/app/courses">My courses</SectionLink>} />
                  <CardBody>
                    {courses.isLoading ? <Skeleton className="h-24" /> : cont?.next_lesson ? (
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <Ring value={cont.percent} label={`${cont.name} completed`} />
                        <div className="min-w-0 flex-1">
                          <div className="eyebrow text-subtle">{cont.name}</div>
                          <div className="mt-1 text-lg font-semibold leading-snug">{cont.next_lesson.title}</div>
                          <div className="mt-1 text-sm text-subtle">{cont.next_lesson.minutes} min · {cont.lessons_completed} of {cont.lessons_total} lessons done</div>
                        </div>
                        <Link to={`/app/activities/${cont.next_lesson.id}`}><Button variant="accent" icon={<PlayCircle className="size-4" />}>{cont.next_lesson.status === "not_started" ? "Start" : "Continue"}</Button></Link>
                      </div>
                    ) : <EmptyState title="Pick what you want to learn" body="Choose a few interests and your courses appear here." action={<Link to="/app/interests"><Button size="sm">Choose interests</Button></Link>} />}
                    {!!courses.data?.length && (
                      <div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                        {courses.data.slice(0, 4).map((c) => (
                          <Link key={c.domain_id} to="/app/courses" className="rounded-xl p-2 hover:bg-muted">
                            <div className="flex justify-between text-sm"><span className="font-medium">{c.name}</span><span className="num text-subtle">{c.percent}%</span></div>
                            <div className="mt-1.5"><ProgressBar value={c.percent} label={`${c.name} progress`} /></div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* My tasks */}
                <Card>
                  <CardHeader title="My tasks" action={<SectionLink to="/app/tasks">All tasks</SectionLink>} />
                  <CardBody>
                    <QueryState q={tasks} skeleton={<Skeleton className="h-28" />}>
                      {(t) => (
                        <>
                          <div className="mb-4 flex flex-wrap gap-2 text-sm">
                            <span className="rounded-full bg-muted px-3 py-1"><strong className="num">{t.counts.pending}</strong> to do</span>
                            {t.counts.overdue > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-3 py-1 text-danger"><AlarmClock className="size-3.5" aria-hidden /><strong className="num">{t.counts.overdue}</strong> overdue</span>}
                            {t.counts.due_soon > 0 && <span className="rounded-full bg-warning-soft px-3 py-1 text-warning"><strong className="num">{t.counts.due_soon}</strong> due soon</span>}
                            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-3 py-1 text-success"><Check className="size-3.5" aria-hidden /><strong className="num">{t.counts.completed_this_week}</strong> done this week</span>
                          </div>
                          {t.pending.length ? <div className="space-y-2">{t.pending.slice(0, 3).map((x) => <TaskRow key={x.assignment_id ?? x.attempt_id} t={x} />)}</div>
                            : <p className="text-sm text-subtle">Nothing assigned right now. Try something from your courses!</p>}
                          {t.quiz_results[0] && (
                            <div className="mt-4 flex items-center justify-between rounded-xl bg-muted p-3 text-sm">
                              <span>Latest quiz: <strong>{t.quiz_results[0].title}</strong></span>
                              <span className="num font-semibold">{t.quiz_results[0].score_pct != null ? `${t.quiz_results[0].score_pct}%` : "Being reviewed"}</span>
                            </div>
                          )}
                        </>
                      )}
                    </QueryState>
                  </CardBody>
                </Card>
              </div>

              <div className="space-y-6">
                {/* Next live session */}
                <Card>
                  <CardHeader title="Next live session" action={<SectionLink to="/app/sessions">All</SectionLink>} />
                  <CardBody>
                    {sessions.isLoading ? <Skeleton className="h-20" /> : next ? <SessionCard s={next} compact /> : <p className="text-sm text-subtle">No sessions scheduled yet.</p>}
                  </CardBody>
                </Card>

                {/* This week */}
                <Card>
                  <CardHeader title="This week" action={<SectionLink to="/app/progress">My progress</SectionLink>} />
                  <CardBody className="space-y-4">
                    {week.data ? (
                      <>
                        <WeekStrip days={week.data.days.slice(7)} />
                        <p className="text-sm"><strong className="num">{week.data.active_days_this_week}</strong> active day{week.data.active_days_this_week === 1 ? "" : "s"} · <strong className="num">{week.data.actions_this_week}</strong> learning actions</p>
                        {week.data.areas_to_improve[0] && (
                          <div className="rounded-xl border border-line p-3 text-sm">
                            <div className="eyebrow text-subtle">Try to improve</div>
                            <div className="mt-1 font-medium">{week.data.areas_to_improve[0].label}</div>
                            <div className="text-subtle">{week.data.areas_to_improve[0].tip}</div>
                          </div>
                        )}
                      </>
                    ) : <Skeleton className="h-24" />}
                  </CardBody>
                </Card>

                {/* Motivation */}
                <section aria-label="Motivation" className="rounded-[var(--radius-card)] bg-dark text-white shadow-card">
                  <div className="space-y-4 p-5">
                    <div className="flex items-center gap-4">
                      <span className="grid size-12 place-items-center rounded-full bg-white/10"><Flame className="size-6 text-[var(--pf-primary)]" aria-hidden /></span>
                      <div><div className="num text-3xl font-bold">{st.current_streak} day{st.current_streak === 1 ? "" : "s"}</div><div className="text-sm text-white/70">learning streak · best {st.longest_streak}</div></div>
                    </div>
                    <p className="text-sm text-white/85">{encouragement(st.current_streak ?? 0, week.data, tasks.data)}</p>
                    {(d.recent_achievements as Array<{ title: string; awarded_at: string }>).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(d.recent_achievements as Array<{ title: string }>).slice(0, 3).map((a) => (
                          <span key={a.title} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs"><Award className="size-3.5 text-[var(--pf-primary)]" aria-hidden />{a.title}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

// ------------------------------------------------------------------ My Courses

export function MyCourses() {
  const q = useQuery({ queryKey: ["courses"], queryFn: () => api.courses() });
  return (
    <>
      <PageHeader title="My Courses" subtitle="One course for each interest you picked. Finish lessons to grow your skills." actions={<Link to="/app/interests"><Button variant="secondary" size="sm">Change interests</Button></Link>} />
      <QueryState q={q} isEmpty={(d) => !d.length} empty={<EmptyState icon={<BookOpen className="size-6" />} title="No courses yet" body="Pick the subjects you're curious about and we'll build your courses." action={<Link to="/app/interests"><Button>Choose interests</Button></Link>} />}>
        {(courses) => <div className="grid gap-5 md:grid-cols-2">{courses.map((c) => <CourseCard key={c.domain_id} c={c} />)}</div>}
      </QueryState>
    </>
  );
}

function CourseCard({ c }: { c: Course }) {
  const done = c.lessons_total > 0 && c.lessons_completed === c.lessons_total;
  return (
    <Card className="flex flex-col">
      <CardBody className="flex flex-1 flex-col gap-4">
        <div className="flex items-start gap-4">
          <Ring value={c.percent} label={`${c.name} completed`} />
          <div className="min-w-0">
            <h2 className="text-xl font-bold">{c.name}</h2>
            {c.tagline && <p className="text-sm text-subtle">{c.tagline}</p>}
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-muted p-2"><dt className="text-xs text-subtle">Done</dt><dd className="num text-lg font-semibold">{c.lessons_completed}</dd></div>
          <div className="rounded-xl bg-muted p-2"><dt className="text-xs text-subtle">In progress</dt><dd className="num text-lg font-semibold">{c.lessons_in_progress}</dd></div>
          <div className="rounded-xl bg-muted p-2"><dt className="text-xs text-subtle">Lessons</dt><dd className="num text-lg font-semibold">{c.lessons_total}</dd></div>
        </dl>
        {c.recent.length > 0 && (
          <div>
            <div className="eyebrow text-subtle">Recent lessons</div>
            <ul className="mt-2 space-y-1">{c.recent.map((r) => (
              <li key={r.id}><Link to={`/app/activities/${r.id}`} className="flex justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted"><span className="truncate">{r.title}</span><span className="shrink-0 text-xs text-subtle">{relTime(r.at)}</span></Link></li>))}</ul>
          </div>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {done ? <Badge tone="success"><span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5" />Course complete</span></Badge>
            : c.next_lesson ? <Link to={`/app/activities/${c.next_lesson.id}`}><Button variant="accent" size="sm" icon={<PlayCircle className="size-4" />}>{c.next_lesson.status === "not_started" ? "Start next lesson" : "Continue lesson"}</Button></Link> : null}
          {c.next_lesson && !done && <span className="text-sm text-subtle">Next: {c.next_lesson.title}</span>}
          <Link to={`/app/domains/${c.slug}`} className="ml-auto text-sm font-medium text-primary-ink hover:underline">Course details</Link>
        </div>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ My Tasks

type TaskTab = "todo" | "review" | "done" | "quizzes";
export function MyTasks() {
  const q = useQuery({ queryKey: ["tasks"], queryFn: () => api.tasks() });
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as TaskTab) || "todo";
  return (
    <>
      <PageHeader title="My Tasks" subtitle="Everything your mentor has asked you to do, in one place." />
      <QueryState q={q}>
        {(t) => (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "To do", value: t.counts.pending, icon: <ListChecks className="size-4" /> },
                { label: "Overdue", value: t.counts.overdue, icon: <AlarmClock className="size-4" /> },
                { label: "Waiting for review", value: t.counts.waiting_review, icon: <Hourglass className="size-4" /> },
                { label: "Done this week", value: t.counts.completed_this_week, icon: <CheckCircle2 className="size-4" /> },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex items-center gap-1.5 text-sm text-subtle">{s.icon}{s.label}</div>
                  <div className="num mt-1 text-2xl font-bold">{s.value}</div>
                </div>
              ))}
            </div>
            <Tabs value={tab} onChange={(k) => setParams({ tab: k })} tabs={[
              { key: "todo", label: `To do (${t.pending.length})` }, { key: "review", label: `Waiting (${t.waiting_review.length})` },
              { key: "done", label: "Completed" }, { key: "quizzes", label: "Quiz results" },
            ]} />
            {tab === "todo" && (t.pending.length ? <div className="space-y-2">{[...t.pending].sort((a, b) => Number(b.overdue) - Number(a.overdue)).map((x) => <TaskRow key={x.assignment_id ?? x.attempt_id} t={x} />)}</div>
              : <EmptyState icon={<CheckCircle2 className="size-6" />} title="You're all caught up!" body="No tasks waiting. Explore your courses to keep learning." action={<Link to="/app/courses"><Button size="sm">Go to my courses</Button></Link>} />)}
            {tab === "review" && (t.waiting_review.length ? <div className="space-y-2">{t.waiting_review.map((x) => (
              <Link key={x.assignment_id} to={taskHref(x)} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-muted">
                <Hourglass className="size-4 text-subtle" aria-hidden /><span className="flex-1 text-sm font-medium">{x.title}</span><Badge>Sent - waiting for feedback</Badge></Link>))}</div>
              : <EmptyState title="Nothing waiting for review" />)}
            {tab === "done" && (t.completed.length ? <Card><ul className="divide-y divide-line">{t.completed.map((c, i) => (
              <li key={i} className="flex items-center gap-3 p-4 text-sm"><CheckCircle2 className="size-4 text-success" aria-hidden /><span className="flex-1">{c.title ?? "Activity"}{c.domain_name && <span className="text-subtle"> · {c.domain_name}</span>}</span>
                {c.score_pct != null && <span className="num font-semibold">{Math.round(c.score_pct)}%</span>}<span className="text-xs text-subtle">{fmtDate(c.at, { day: "numeric", month: "short" })}</span></li>))}</ul></Card>
              : <EmptyState title="No completed tasks yet" body="Your finished work will show up here." />)}
            {tab === "quizzes" && (t.quiz_results.length ? <Card><ul className="divide-y divide-line">{t.quiz_results.map((r) => (
              <li key={r.attempt_id}><Link to={`/app/assessments/attempts/${r.attempt_id}`} className="flex items-center gap-3 p-4 text-sm hover:bg-muted">
                <Star className="size-4 text-primary-ink" aria-hidden /><span className="flex-1">{r.title}{r.domain_name && <span className="text-subtle"> · {r.domain_name}</span>}</span>
                {r.score_pct != null ? <span className="num font-semibold">{r.score_pct}%</span> : <Badge tone="warning">Being reviewed</Badge>}
                <span className="text-xs text-subtle">{fmtDate(r.at, { day: "numeric", month: "short" })}</span></Link></li>))}</ul></Card>
              : <EmptyState title="No quiz results yet" action={<Link to="/app/assessments"><Button size="sm" variant="secondary">Take a quiz</Button></Link>} />)}
          </div>
        )}
      </QueryState>
    </>
  );
}

// ------------------------------------------------------------------ Live Sessions

export function LiveSessions() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const q = useQuery({ queryKey: ["sessions", tab], queryFn: () => api.sessions.list({ when: tab, limit: 50 }), refetchInterval: 60_000 });
  const summary = useQuery({ queryKey: ["attendance-summary"], queryFn: () => api.sessions.summary() });
  return (
    <>
      <PageHeader title="Live Sessions" subtitle="Classes and check-ins with your mentor. The join button appears 15 minutes before start." />
      {summary.data && (
        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-4">
          <CalendarDays className="size-5 text-primary-ink" aria-hidden />
          <div className="text-sm">
            {summary.data.rate == null ? "Your attendance will appear after your first session." : (
              <>You attended <strong className="num">{summary.data.attended}</strong> of <strong className="num">{summary.data.sessions}</strong> sessions (<strong className="num">{summary.data.rate}%</strong>) - <span className="font-medium">{summary.data.label}</span></>
            )}
          </div>
        </div>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "upcoming", label: "Upcoming" }, { key: "past", label: "Past" }]} />
      <div className="mt-4">
        <QueryState q={q} isEmpty={(d) => !d.length} empty={<EmptyState icon={<Video className="size-6" />} title={tab === "upcoming" ? "No sessions scheduled" : "No past sessions"} body={tab === "upcoming" ? "When your mentor schedules a session it will show up here and in your notifications." : undefined} />}>
          {(rows) => <div className="space-y-3">{rows.map((s) => <SessionCard key={s.id} s={s} />)}</div>}
        </QueryState>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ My Progress

export function MyProgress() {
  const week = useQuery({ queryKey: ["week"], queryFn: () => api.week() });
  const toast = useToast();
  const [text, setText] = useState("");
  const reflect = useMutation({ mutationFn: () => api.progress.reflect({ text }), onSuccess: () => { setText(""); toast.success("Reflection saved (+10 XP)"); }, onError: (e) => toast.error(e) });
  const [detail, setDetail] = useState(false);
  return (
    <>
      <PageHeader title="My Progress" subtitle="You are only ever compared with your past self." />
      <QueryState q={week}>
        {(w) => (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Weekly activity" subtitle="Learning actions per day, last 2 weeks" />
              <CardBody className="space-y-4">
                <WeekStrip days={w.days.slice(7)} />
                <div className="grid grid-cols-3 gap-3 text-center text-sm">
                  <div className="rounded-xl bg-muted p-3"><div className="num text-2xl font-bold">{w.active_days_this_week}</div><div className="text-subtle">active days</div></div>
                  <div className="rounded-xl bg-muted p-3"><div className="num text-2xl font-bold">{w.actions_this_week}</div><div className="text-subtle">actions this week</div></div>
                  <div className="rounded-xl bg-muted p-3"><div className="num text-2xl font-bold">{w.actions_last_week}</div><div className="text-subtle">last week</div></div>
                </div>
                <p className="flex items-center gap-2 text-sm">
                  <TrendingUp className="size-4 text-primary-ink" aria-hidden />
                  {w.actions_this_week > w.actions_last_week ? "More active than last week - great work!"
                    : w.actions_this_week === w.actions_last_week ? "Same as last week. Steady is good!"
                    : "A bit quieter than last week. A short lesson today helps."}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="My skills" subtitle="Measured from your reviewed work" />
              <CardBody className="space-y-3">
                {w.skills.length ? w.skills.map((s) => (
                  <div key={s.domain_name}>
                    <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{s.domain_name}</span><span className="num">{s.skill_score}</span></div>
                    <ProgressBar value={s.skill_score} label={`${s.domain_name} skill`} />
                    <div className="mt-0.5 text-xs text-subtle">{s.evidence_count} pieces of evidence</div>
                  </div>
                )) : <p className="text-sm text-subtle">Finish a few activities and your skills will appear here.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="What you're good at" />
              <CardBody className="space-y-3">{w.strengths.length ? w.strengths.map((s) => (
                <div key={s.key} className="flex gap-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden /><div><div className="font-medium">{s.label}</div><div className="text-sm text-subtle">{s.tip}</div></div></div>))
                : <p className="text-sm text-subtle">Keep going - we need a little more work to spot your strengths.</p>}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Areas to improve" />
              <CardBody className="space-y-3">{w.areas_to_improve.length ? w.areas_to_improve.map((s) => (
                <div key={s.key} className="flex gap-3"><Target className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden /><div><div className="font-medium">{s.label}</div><div className="text-sm text-subtle">{s.tip}</div></div></div>))
                : <p className="text-sm text-subtle">Not enough information yet.</p>}</CardBody>
            </Card>
            <Card>
              <CardHeader title="Write a reflection" subtitle="How is your learning going?" />
              <CardBody className="space-y-3"><Textarea aria-label="Reflection" value={text} onChange={(e) => setText(e.target.value)} placeholder="This week I learned..." />
                <Button className="w-full" disabled={text.length < 3} loading={reflect.isPending} onClick={() => reflect.mutate()}>Save reflection</Button></CardBody>
            </Card>
          </div>
        )}
      </QueryState>
      <div className="mt-8">
        {detail ? <><h2 className="mb-4 text-xl font-bold">Detailed analytics</h2><ProgressPanel /></>
          : <Button variant="secondary" onClick={() => setDetail(true)} icon={<TrendingUp className="size-4" />}>Show detailed analytics</Button>}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ My Profile

export function MyProfile() {
  const me = useAuth((s) => s.me)!;
  const q = useQuery({ queryKey: ["student-me"], queryFn: () => api.students.me() });
  const mentors = useQuery({ queryKey: ["contacts", "me"], queryFn: () => api.messages.contacts() });
  const game = useQuery({ queryKey: ["achievements"], queryFn: () => api.achievements.get() });
  return (
    <QueryState q={q}>
      {(s) => (
        <div className="space-y-6">
          <section className="flex flex-col items-start gap-5 rounded-[var(--pf-radius)] bg-surface p-6 shadow-card sm:flex-row sm:items-center">
            <Avatar name={me.user.full_name} size={80} />
            <div className="flex-1">
              <h1 className="text-3xl font-bold">{me.user.full_name}</h1>
              <p className="mt-1 text-subtle">{[s.class_name || (s.grade && `Grade ${s.grade}`), s.school_name].filter(Boolean).join(" · ") || "Add your school details in Settings"}</p>
              <p className="text-sm text-subtle">{s.age} years old{s.age_group ? ` · ${s.age_group.label}` : ""}</p>
            </div>
            <Link to="/app/settings"><Button variant="secondary">Edit profile</Button></Link>
          </section>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface p-4"><div className="text-sm text-subtle">Level</div><div className="num text-2xl font-bold">{game.data?.level ?? "-"}</div></div>
            <div className="rounded-2xl border border-line bg-surface p-4"><div className="text-sm text-subtle">Total XP</div><div className="num text-2xl font-bold">{s.xp}</div></div>
            <div className="rounded-2xl border border-line bg-surface p-4"><div className="text-sm text-subtle">Best streak</div><div className="num text-2xl font-bold">{s.longest_streak} days</div></div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader title="About me" /><CardBody className="space-y-4 text-sm">
              {([["Favourite subjects", s.favourite_subjects], ["Hobbies", s.hobbies], ["I'm good at", s.self_reported_strengths], ["I want to learn", s.skills_to_learn]] as Array<[string, string[]]>).map(([k, v]) => (
                <div key={k}><div className="eyebrow text-subtle">{k}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{v.length ? v.map((x) => <Badge key={x}>{x}</Badge>) : <span className="text-subtle">Not added yet</span>}</div></div>))}
              {s.aspirations && <div><div className="eyebrow text-subtle">My dream</div><p className="mt-1.5">{s.aspirations}</p></div>}
            </CardBody></Card>
            <div className="space-y-6">
              <Card><CardHeader title="My mentors" /><CardBody>
                {mentors.data?.length ? <ul className="space-y-2">{mentors.data.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3"><Avatar name={m.name} size={36} /><span className="flex-1 text-sm font-medium">{m.name}</span>
                    <Link to="/app/messages"><Button size="sm" variant="ghost" icon={<MessageSquare className="size-4" />}>Message</Button></Link></li>))}</ul>
                  : <p className="text-sm text-subtle">No mentor assigned yet.</p>}
              </CardBody></Card>
              <Card><CardHeader title="Shortcuts" /><CardBody className="grid gap-2 text-sm">
                {[["/app/portfolio", "My portfolio", Award], ["/app/roadmap", "My roadmap", Target], ["/app/settings", "Settings, privacy & parent invite code", UserRound]].map(([to, label, Icon]) => {
                  const C = Icon as typeof Award;
                  return <Link key={to as string} to={to as string} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted"><C className="size-4 text-primary-ink" aria-hidden />{label as string}<ArrowRight className="ml-auto size-4 text-subtle" /></Link>;
                })}
              </CardBody></Card>
            </div>
          </div>
        </div>
      )}
    </QueryState>
  );
}
