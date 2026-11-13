import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Award, CalendarCheck, CheckCircle2, FileText, HeartHandshake, Info, ListChecks, MessageSquare, MessageSquareQuote, Plus, ShieldCheck, TrendingUp, Video } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { ProgressPanel } from "../student/Progress";
import { PortfolioView } from "../student/Portfolio";
import { AiLabel, Avatar, Badge, Button, Card, CardBody, CardHeader, cx, EmptyState, Field, Input, Modal, PageHeader, QueryState, Select, Tabs, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDate, fmtDateTime, relTime, titleCase } from "@/lib/format";

type Overview = Awaited<ReturnType<typeof api.guardians.overview>>;

/** The four questions parents ask first, answered in plain language with an icon + label (never colour alone). */
function answers(o: Overview) {
  const name = o.student.full_name.split(" ")[0];
  const trend = o.progress.overall.trend_label;
  const evidence = o.progress.overall.evidence_count;
  const progressing = evidence < 3 ? { state: "info", head: "Too early to tell", body: `${name} has ${evidence} reviewed piece${evidence === 1 ? "" : "s"} of work so far.` }
    : trend === "improving" ? { state: "good", head: "Yes, improving", body: "Scores on repeated activities are going up." }
    : trend === "declining" ? { state: "watch", head: "Needs a little support", body: "Recent scores dipped - a chat with the mentor can help." }
    : { state: "good", head: "Steady progress", body: "Keeping a consistent level of work." };
  const t = o.tasks;
  const tasks = t.overdue ? { state: "watch", head: `${t.overdue} overdue`, body: `${t.pending} task${t.pending === 1 ? "" : "s"} still to do.` }
    : t.pending ? { state: "info", head: `${t.pending} to do`, body: "Nothing overdue." }
    : { state: "good", head: "All caught up", body: `${t.completed} task${t.completed === 1 ? "" : "s"} completed so far.` };
  const at = o.attendance;
  const attendance = at.rate == null ? { state: "info", head: "No sessions yet", body: "Attendance appears after the first live session." }
    : at.rate >= 75 ? { state: "good", head: `${at.label} (${at.rate}%)`, body: `Attended ${at.attended} of ${at.sessions} sessions.` }
    : { state: "watch", head: `Needs attention (${at.rate}%)`, body: `Missed ${at.missed} of ${at.sessions} sessions.` };
  const f = o.mentor_feedback[0];
  const feedback = f ? { state: "info", head: `From ${f.mentor_name ?? "the mentor"}`, body: `"${f.content.length > 110 ? f.content.slice(0, 110) + "..." : f.content}"` }
    : { state: "info", head: "No feedback yet", body: "Mentor notes shared with you will appear here." };
  return [
    { q: `Is ${name} progressing?`, icon: TrendingUp, ...progressing },
    { q: "Any pending tasks?", icon: ListChecks, ...tasks },
    { q: "Is attendance OK?", icon: CalendarCheck, ...attendance },
    { q: "What did the mentor say?", icon: MessageSquareQuote, ...feedback },
  ];
}

const STATE: Record<string, { icon: typeof CheckCircle2; label: string; cls: string }> = {
  good: { icon: CheckCircle2, label: "Good", cls: "text-success" },
  watch: { icon: AlertTriangle, label: "Worth a look", cls: "text-danger" },
  info: { icon: Info, label: "Note", cls: "text-subtle" },
};

export function AnswerGrid({ o }: { o: Overview }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {answers(o).map((a) => {
        const st = STATE[a.state]!;
        return (
          <div key={a.q} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2 text-sm text-subtle"><a.icon className="size-4 text-primary-ink" aria-hidden />{a.q}</div>
            <div className="mt-2 flex items-center gap-1.5 font-semibold"><st.icon className={cx("size-4 shrink-0", st.cls)} aria-label={st.label} />{a.head}</div>
            <p className="mt-1 text-sm text-subtle">{a.body}</p>
          </div>
        );
      })}
    </div>
  );
}

function ChildSummary({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["child", id], queryFn: () => api.guardians.overview(id) });
  return (
    <QueryState q={q} skeleton={<Card className="h-64 skeleton" />}>
      {(o) => {
        const next = o.upcoming_sessions[0];
        return (
          <Card>
            <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center">
              <Avatar name={o.student.full_name} size={56} />
              <div className="flex-1">
                <h2 className="text-xl font-bold">{o.student.full_name}</h2>
                <p className="text-sm text-subtle">{[o.student.age_group, o.student.grade && `Grade ${o.student.grade}`, o.student.school_name].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={`/parent/messages?student=${id}`}><Button variant="secondary" size="sm" icon={<MessageSquare className="size-4" />}>Message mentor</Button></Link>
                <Link to={`/parent/children/${id}`}><Button size="sm">Full details</Button></Link>
              </div>
            </div>
            <CardBody className="space-y-4">
              <AnswerGrid o={o} />
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl bg-muted p-3"><Video className="size-4 shrink-0 text-primary-ink" aria-hidden />
                  {next ? <span>Next session: <strong>{next.title}</strong>, {new Date(next.starts_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span> : <span className="text-subtle">No upcoming sessions</span>}</div>
                <div className="flex items-center gap-3 rounded-xl bg-muted p-3"><Award className="size-4 shrink-0 text-primary-ink" aria-hidden />
                  {o.achievements[0] ? <span>Latest badge: <strong>{o.achievements[0].title}</strong> ({relTime(o.achievements[0].at)})</span> : <span className="text-subtle">No badges yet</span>}</div>
              </div>
            </CardBody>
          </Card>
        );
      }}
    </QueryState>
  );
}

export function ParentHome() {
  const q = useQuery({ queryKey: ["children"], queryFn: () => api.guardians.children() });
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="My children" subtitle="A quick, plain-language view of how each child is doing. You only see records your child's school has authorised."
        actions={<Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Link a child</Button>} />
      <QueryState q={q} isEmpty={(d) => !d.length} empty={<EmptyState icon={<HeartHandshake className="size-6" />} title="No children linked yet" body="Ask your child for the invite code shown in their PathFinder onboarding or settings." action={<Button onClick={() => setOpen(true)}>Enter invite code</Button>} />}>
        {(kids) => (
          <div className="space-y-6">
            {kids.some((k) => k.consent_status === "pending") && (
              <Card className="flex flex-wrap items-center gap-3 border-warning/40 bg-warning-soft p-4 text-sm"><ShieldCheck className="size-5 text-warning" aria-hidden />
                <span className="flex-1"><strong>Consent needed.</strong> Some features stay off until you review consent for {kids.filter((k) => k.consent_status === "pending").map((k) => k.full_name.split(" ")[0]).join(", ")}.</span>
                <Link to={`/parent/children/${kids.find((k) => k.consent_status === "pending")!.id}?tab=consent`}><Button size="sm">Review consent</Button></Link></Card>
            )}
            {kids.map((k) => <ChildSummary key={k.id} id={k.id} />)}
          </div>
        )}
      </QueryState>
      <LinkChild open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function LinkChild({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [rel, setRel] = useState("parent");
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({ mutationFn: () => api.guardians.link(code.trim().toUpperCase(), rel), onSuccess: () => { qc.invalidateQueries({ queryKey: ["children"] }); toast.success("Child linked. Please review consent settings."); onClose(); }, onError: (e) => toast.error(e) });
  return (
    <Modal open={open} onClose={onClose} title="Link a child" footer={<Button loading={m.isPending} disabled={code.length < 6} onClick={() => m.mutate()}>Link</Button>}>
      <div className="space-y-3">
        <Field label="Invite code" htmlFor="ic"><Input id="ic" className="font-mono uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label="Relationship" htmlFor="rel"><Select id="rel" value={rel} onChange={(e) => setRel(e.target.value)}><option value="parent">Parent</option><option value="guardian">Guardian</option><option value="grandparent">Grandparent</option><option value="other">Other</option></Select></Field>
      </div>
    </Modal>
  );
}

type Tab = "overview" | "progress" | "portfolio" | "reports" | "consent";

export function ChildView() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "overview");
  const q = useQuery({ queryKey: ["child", id], queryFn: () => api.guardians.overview(id) });
  return (
    <QueryState q={q}>
      {(o) => (
        <>
          <Link to="/parent" className="text-sm text-subtle hover:text-ink">← My children</Link>
          <div className="my-4 flex items-center gap-4"><Avatar name={o.student.full_name} size={56} /><div><h1 className="text-2xl font-bold">{o.student.full_name}</h1><p className="text-sm text-subtle">{o.student.age_group} · {o.student.school_name}</p></div>
            <Link to={`/parent/messages?student=${id}`} className="ml-auto"><Button variant="secondary" icon={<MessageSquare className="size-4" />}>Message mentor</Button></Link></div>
          <Tabs value={tab} onChange={setTab} tabs={[{ key: "overview", label: "Overview" }, { key: "progress", label: "Progress" }, { key: "portfolio", label: "Portfolio" }, { key: "reports", label: "Reports" }, { key: "consent", label: "Consent & privacy" }]} />
          <div className="mt-6">
            {tab === "overview" && <Overview o={o} />}
            {tab === "progress" && <ProgressPanel studentId={id} showAi={false} />}
            {tab === "portfolio" && <ChildPortfolio id={id} />}
            {tab === "reports" && <Reports id={id} />}
            {tab === "consent" && <Consent id={id} />}
          </div>
        </>
      )}
    </QueryState>
  );
}

function Overview({ o }: { o: Overview }) {
  const p = o.progress.overall;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-3"><AnswerGrid o={o} /></div>
      <Card><CardHeader title="Tasks" subtitle={`${o.tasks.completed} completed in total`} /><CardBody className="space-y-2 text-sm">
        {o.tasks.items.length ? o.tasks.items.map((t, i) => (
          <div key={i} className="flex items-center justify-between gap-2 rounded-xl border border-line p-2.5">
            <span className="truncate">{t.title}</span>
            {t.overdue ? <Badge tone="danger"><span className="inline-flex items-center gap-1"><AlertTriangle className="size-3" />Overdue</span></Badge>
              : <span className="shrink-0 text-xs text-subtle">{t.due_at ? `Due ${fmtDate(t.due_at, { day: "numeric", month: "short" })}` : "No deadline"}</span>}
          </div>)) : <p className="text-subtle">No pending tasks.</p>}
      </CardBody></Card>
      <Card><CardHeader title="Attendance & sessions" /><CardBody className="space-y-3 text-sm">
        <p>{o.attendance.rate == null ? "No sessions attended yet." : <>Attended <strong>{o.attendance.attended}</strong> of <strong>{o.attendance.sessions}</strong> sessions (<strong>{o.attendance.rate}%</strong>) - {o.attendance.label}.</>}</p>
        {o.upcoming_sessions.map((s) => <div key={s.id} className="rounded-xl bg-muted p-2.5"><div className="font-medium">{s.title}</div><div className="text-xs text-subtle">{new Date(s.starts_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{s.mentor_name ? ` · ${s.mentor_name}` : ""}</div></div>)}
        {!o.upcoming_sessions.length && <p className="text-subtle">No upcoming sessions.</p>}
      </CardBody></Card>
      <Card><CardHeader title="Achievements" /><CardBody className="space-y-2 text-sm">
        {o.achievements.length ? o.achievements.map((a) => <div key={a.title} className="flex items-center gap-2"><Award className="size-4 text-primary-ink" aria-hidden />{a.title}<span className="ml-auto text-xs text-subtle">{fmtDate(a.at, { day: "numeric", month: "short" })}</span></div>) : <p className="text-subtle">No badges yet.</p>}
      </CardBody></Card>
      <Card><CardHeader title="Chosen interests" subtitle="Your child picked these" /><CardBody className="flex flex-wrap gap-2">{o.interests.map((i) => <Badge key={i.domain_id} tone="primary">{i.domain_name}{i.is_favourite ? " ★" : ""}</Badge>)}{!o.interests.length && <span className="text-sm text-subtle">None yet</span>}</CardBody></Card>
      <Card><CardHeader title="Growth at a glance" /><CardBody className="space-y-1 text-sm">
        <p>Reviewed pieces of work: <strong>{p.evidence_count}</strong></p>
        <p>Trend on repeated activities: <strong>{titleCase(p.trend_label)}</strong></p>
        <p>Improvement: <strong>{p.improvement_points == null ? "not enough repeats yet" : `${p.improvement_points > 0 ? "+" : ""}${p.improvement_points} points`}</strong></p>
        <p className="pt-1 text-xs text-subtle">Scores describe recorded activities, not intelligence.</p></CardBody></Card>
      <Card><CardHeader title="Mentors" /><CardBody className="space-y-1 text-sm">{o.mentors.map((m) => <div key={m.user_id}>{m.name}</div>)}{!o.mentors.length && <span className="text-subtle">No mentor assigned yet</span>}</CardBody></Card>
      <Card className="lg:col-span-2"><CardHeader title="Recent activity" /><CardBody>
        {o.recent_activity.length ? <ul className="divide-y divide-line text-sm">{o.recent_activity.map((a, i) => <li key={i} className="flex justify-between py-2"><span>{titleCase(a.type)}{a.title ? `: ${a.title}` : ""} <span className="text-subtle">{a.domain_name}</span></span><span className="flex gap-2 text-xs text-subtle">{a.score_pct != null && <Badge tone="primary">{a.score_pct.toFixed(0)}%</Badge>}{relTime(a.at)}</span></li>)}</ul> : <p className="text-sm text-subtle">Nothing yet.</p>}
      </CardBody></Card>
      <Card><CardHeader title="Mentor feedback" /><CardBody className="space-y-3">{o.mentor_feedback.map((f, i) => <div key={i} className="rounded-xl bg-muted p-3 text-sm"><p>"{f.content}"</p><p className="mt-1 text-xs text-subtle">{f.mentor_name} · {fmtDate(f.at)}</p></div>)}{!o.mentor_feedback.length && <p className="text-sm text-subtle">No feedback yet.</p>}</CardBody></Card>
      <Card className="lg:col-span-3"><CardHeader title="Development recommendations" /><CardBody className="grid gap-3 md:grid-cols-2">{o.recommendations.map((r, i) => <div key={i} className="rounded-xl border border-line p-3 text-sm"><strong>{r.title}</strong><p className="text-subtle">{r.reasons[0]}</p></div>)}{!o.recommendations.length && <p className="text-sm text-subtle">No active suggestions.</p>}</CardBody></Card>
    </div>
  );
}

function ChildPortfolio({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["portfolio", id], queryFn: () => api.portfolios.get(id) });
  const qc = useQueryClient();
  const toast = useToast();
  const approve = useMutation({ mutationFn: (v: boolean) => api.portfolios.guardianApproval(id, v), onSuccess: (d) => { qc.setQueryData(["portfolio", id], d); toast.success("Sharing preference saved"); } });
  return (
    <QueryState q={q}>
      {(p) => (<>
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>Public link sharing is <strong>{p.guardian_approved_sharing ? "allowed" : "not allowed"}</strong>. Visibility now: <Badge>{p.visibility}</Badge></span>
          <Button size="sm" variant={p.guardian_approved_sharing ? "secondary" : "primary"} loading={approve.isPending} onClick={() => approve.mutate(!p.guardian_approved_sharing)}>{p.guardian_approved_sharing ? "Turn off link sharing" : "Allow link sharing"}</Button>
        </Card>
        <PortfolioView p={p} editable={false} />
      </>)}
    </QueryState>
  );
}

function Reports({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["reports", id], queryFn: () => api.reports.list({ student_id: id }) });
  const qc = useQueryClient();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const gen = useMutation({ mutationFn: (k: "weekly" | "monthly" | "parent") => api.reports.generate(k, id), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["reports", id] }); setOpenId(r.id); }, onError: (e) => toast.error(e) });
  const open = q.data?.items.find((r) => r.id === openId);
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button variant="secondary" loading={gen.isPending && gen.variables === "weekly"} onClick={() => gen.mutate("weekly")}>Weekly report</Button>
        <Button variant="secondary" loading={gen.isPending && gen.variables === "monthly"} onClick={() => gen.mutate("monthly")}>Monthly report</Button>
        <Button loading={gen.isPending && gen.variables === "parent"} onClick={() => gen.mutate("parent")}>Parent-friendly summary</Button>
      </div>
      <QueryState q={q} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<FileText className="size-6" />} title="No reports yet" />}>
        {(d) => <Card className="divide-y divide-line">{d.items.map((r) => (
          <button key={r.id} onClick={() => setOpenId(r.id)} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-muted">
            <span className="text-sm font-medium">{r.title}</span><span className="flex gap-2 text-xs text-subtle">{r.is_demo && <Badge tone="warning">Demo</Badge>}<Badge>{r.generated_by}</Badge>{fmtDateTime(r.created_at)}</span>
          </button>))}</Card>}
      </QueryState>
      <Modal wide open={!!open} onClose={() => setOpenId(null)} title={open?.title ?? ""}>{open && <ReportBody content={open.content} />}</Modal>
    </>
  );
}

export function ReportBody({ content }: { content: Record<string, unknown> }) {
  const c = content as { label?: string; source?: string; sections?: Array<{ title: string; body: string }>; summary?: { paragraphs: string[] }; progress?: { domains: Array<{ domain_name: string; skill_score: number | null; status: string; evidence_count: number }> } };
  return (
    <div className="space-y-4 text-sm">
      {c.label && <AiLabel source={c.source === "ai" ? "ai" : "engine"} label={c.label} />}
      {c.sections?.map((s) => <section key={s.title}><h3 className="font-semibold">{s.title}</h3><p className="mt-1 whitespace-pre-line text-subtle">{s.body}</p></section>)}
      {c.summary?.paragraphs.map((p) => <p key={p}>{p}</p>)}
      {c.progress && <table className="w-full text-left"><thead><tr className="text-subtle"><th>Domain</th><th>Status</th><th>Skill</th><th>Records</th></tr></thead><tbody>{c.progress.domains.map((d) => <tr key={d.domain_name} className="border-t border-line"><td className="py-1">{d.domain_name}</td><td>{d.status}</td><td>{d.skill_score ?? "-"}</td><td>{d.evidence_count}</td></tr>)}</tbody></table>}
    </div>
  );
}

const CONSENTS: Array<[string, string]> = [
  ["data_processing", "Process learning data to run PathFinder (required for use)"],
  ["ai_processing", "Use AI to generate guidance from learning records"],
  ["mentor_access", "Allow assigned mentors to view records"],
  ["communications", "Send notifications and reports"],
  ["portfolio_sharing", "Allow portfolio link sharing"],
];

function Consent({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["consents", id], queryFn: () => api.guardians.consents(id) });
  const qc = useQueryClient();
  const toast = useToast();
  const m = useMutation({ mutationFn: (v: { type: string; granted: boolean }) => api.guardians.setConsent(id, v.type, v.granted), onSuccess: () => { qc.invalidateQueries({ queryKey: ["consents", id] }); qc.invalidateQueries({ queryKey: ["children"] }); toast.success("Consent updated"); }, onError: (e) => toast.error(e) });
  return (
    <QueryState q={q}>
      {(c) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader title="Consent settings" subtitle="Recorded with time and policy version (DPDP Act)" /><CardBody className="space-y-2">
            {CONSENTS.map(([k, label]) => (
              <label key={k} className="flex items-start justify-between gap-3 rounded-xl p-2 hover:bg-muted">
                <span className="text-sm">{label}{c.current[k]?.at && <span className="block text-xs text-subtle">Updated {fmtDate(c.current[k]!.at)}</span>}</span>
                <input type="checkbox" className="mt-1 size-5 accent-[var(--pf-primary)]" checked={!!c.current[k]?.granted} disabled={m.isPending} onChange={(e) => m.mutate({ type: k, granted: e.target.checked })} />
              </label>
            ))}
          </CardBody></Card>
          <Card><CardHeader title="Consent history" /><CardBody><ul className="space-y-1 text-sm">{c.history.map((h, i) => <li key={i} className="flex justify-between"><span>{titleCase(h.type)}</span><span className="text-subtle"><Badge tone={h.granted ? "success" : "danger"}>{h.granted ? "granted" : "withdrawn"}</Badge> {fmtDateTime(h.at)}</span></li>)}</ul>
            <p className="mt-4 flex gap-2 text-xs text-subtle"><ShieldCheck className="size-4 shrink-0" />You can withdraw consent at any time. Withdrawing AI consent switches guidance to the rule-based engine.</p></CardBody></Card>
        </div>
      )}
    </QueryState>
  );
}
