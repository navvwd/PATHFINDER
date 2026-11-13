import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Domain } from "@pathfinder/shared-types";
import { AlertTriangle, CheckCircle2, ChevronRight, Megaphone, Pencil, Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Modal, PageHeader, Pagination, QueryState, Select, Table, Textarea, useToast } from "@/components/ui";
import { api, useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";

const BRAND_SWATCHES: Array<[string, string]> = [["Ink", "#171717"], ["Orange", "#ff4d24"], ["Deep orange", "#c72e12"], ["Grey", "#6b6b6b"], ["Peach", "#ff9576"], ["Ember", "#5c160a"]];

const KPI = ({ label, value, sub, to }: { label: string; value: ReactNode; sub?: ReactNode; to?: string }) => {
  const body = (
    <div className="h-full rounded-2xl border border-line bg-surface p-4 transition hover:border-[var(--pf-text-muted)]">
      <div className="text-xs font-medium text-subtle">{label}</div>
      <div className="num mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-subtle">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
};

/** Labelled horizontal bars: readable at any width, value always printed. */
function BarList({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="truncate text-subtle">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="num text-right font-semibold">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function AdminHome() {
  const me = useAuth((s) => s.me)!;
  const isSuper = me.user.role === "super_admin";
  const o = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.admin.overview() });
  const p = useQuery({ queryKey: ["platform-analytics"], queryFn: () => api.analytics.platform(), retry: false });
  const logs = useQuery({ queryKey: ["audit-recent"], queryFn: () => api.admin.auditLogs({ page_size: 8 }), enabled: isSuper, retry: false });
  const pending = useQuery({ queryKey: ["institutions-pending"], queryFn: () => api.institutions.list({ page_size: 100 }) });
  return (
    <>
      <PageHeader title="Platform overview" subtitle="Accounts, allocation, content and activity across PathFinder"
        actions={<div className="flex flex-wrap gap-2">
          <Link to="/admin/users"><Button size="sm" icon={<Plus className="size-4" />}>Create user</Button></Link>
          <Link to="/admin/allocation"><Button size="sm" variant="secondary">Allocate mentors</Button></Link>
          <Link to="/admin/notifications"><Button size="sm" variant="secondary" icon={<Megaphone className="size-4" />}>Announce</Button></Link>
        </div>} />
      <QueryState q={o}>
        {(d) => {
          const u = d.users;
          const total = Object.values(u).reduce((n, v) => n + v, 0);
          const mentors = (u.mentor ?? 0) + (u.teacher ?? 0);
          const pendingInst = pending.data?.items.filter((i) => !i.is_active) ?? [];
          const alerts = [
            d.allocation.students_without_mentor > 0 && { text: `${d.allocation.students_without_mentor} student(s) have no mentor`, to: "/admin/allocation" },
            d.allocation.mentors_without_batches > 0 && { text: `${d.allocation.mentors_without_batches} mentor(s) have no students`, to: "/admin/allocation" },
            d.institutions.pending > 0 && { text: `${d.institutions.pending} institution(s) waiting for approval`, to: "/admin/institutions" },
            d.accounts.locked > 0 && { text: `${d.accounts.locked} account(s) temporarily locked`, to: "/admin/users" },
            d.security_events_7d > 0 && isSuper && { text: `${d.security_events_7d} security event(s) this week`, to: "/admin/security" },
            d.content.drafts > 0 && { text: `${d.content.drafts} draft activit${d.content.drafts === 1 ? "y" : "ies"} not published`, to: "/mentor/activities" },
          ].filter(Boolean) as Array<{ text: string; to: string }>;
          return (
            <div className="space-y-6">
              <section aria-label="People">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <KPI label="Total users" value={total} sub={`+${d.signups_7d} this week`} to="/admin/users" />
                  <KPI label="Students" value={u.student ?? 0} to="/admin/users" />
                  <KPI label="Mentors & teachers" value={mentors} to="/admin/users" />
                  <KPI label="Guardians" value={u.guardian ?? 0} to="/admin/users" />
                  <KPI label="Active accounts" value={d.accounts.active} sub={`${d.accounts.active_30d} signed in (30d)`} />
                  <KPI label="Inactive accounts" value={d.accounts.inactive} sub={`${d.accounts.never_logged_in} never signed in`} />
                </div>
              </section>
              <section aria-label="Platform activity" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <KPI label="Institutions" value={d.institutions.active} sub={`${d.institutions.pending} pending`} to="/admin/institutions" />
                <KPI label="Published activities" value={d.content.activities} sub={`${d.content.assessments} assessments`} to="/mentor/activities" />
                <KPI label="Upcoming sessions" value={d.sessions.upcoming} sub={`${d.sessions.last_7d} held this week`} />
                <KPI label="Attendance rate" value={d.sessions.attendance_rate == null ? "-" : `${d.sessions.attendance_rate}%`} sub="All marked sessions" />
                <KPI label="Active students (30d)" value={(p.data?.active_students_30d as number | undefined) ?? "-"} sub={p.data ? `${p.data.submissions_30d as number} submissions` : undefined} />
                <KPI label="AI requests (7d)" value={d.ai_requests_7d} to={isSuper ? "/admin/ai" : undefined} />
              </section>

              <div className="grid gap-6 xl:grid-cols-3">
                <Card>
                  <CardHeader title="Needs attention" />
                  <CardBody className="space-y-2">
                    {alerts.length ? alerts.map((x) => (
                      <Link key={x.text} to={x.to} className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm hover:bg-muted"><AlertTriangle className="size-4 shrink-0 text-primary-ink" aria-hidden /><span className="flex-1">{x.text}</span><ChevronRight className="size-4 text-subtle" /></Link>
                    )) : <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-success" aria-hidden />Nothing needs attention.</p>}
                    {pendingInst.slice(0, 3).map((i) => <div key={i.id} className="flex items-center justify-between rounded-xl bg-muted p-3 text-sm"><span>{i.name}</span><Badge tone="warning">Pending</Badge></div>)}
                  </CardBody>
                </Card>
                <Card><CardHeader title="Users by role" /><CardBody><BarList rows={ROLES.filter((r) => u[r]).map((r) => ({ label: titleCase(r), value: u[r] ?? 0 }))} /></CardBody></Card>
                {p.data ? <Card><CardHeader title="Interest by domain" subtitle="Students who chose each domain" /><CardBody><BarList rows={(p.data.domain_interest as Array<{ domain: string; students: number }>).map((x) => ({ label: x.domain, value: x.students }))} /></CardBody></Card> : <Card className="skeleton h-72" />}
              </div>

              {isSuper && (
                <Card>
                  <CardHeader title="Recent activity log" action={<Link className="text-sm font-medium text-primary-ink" to="/admin/security">Full log</Link>} />
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead><tr className="border-b border-line text-left text-xs text-subtle"><th className="px-5 py-2 font-medium">When</th><th className="px-2 py-2 font-medium">Action</th><th className="px-2 py-2 font-medium">By</th><th className="px-2 py-2 font-medium">Category</th></tr></thead>
                      <tbody>{logs.data?.items.map((l) => (
                        <tr key={l.id} className="border-b border-line last:border-0"><td className="whitespace-nowrap px-5 py-2 text-subtle">{fmtDateTime(l.created_at)}</td><td className="px-2 py-2"><code className="text-xs">{l.action}</code></td><td className="px-2 py-2">{l.actor ?? "System"}</td><td className="px-2 py-2"><Badge tone={l.category === "security" ? "danger" : "neutral"}>{l.category}</Badge></td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

const ROLES = ["student", "guardian", "teacher", "mentor", "institution_admin", "platform_admin", "super_admin"];

export function AdminUsers() {
  const me = useAuth((s) => s.me)!;
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["users", page, role, search], queryFn: () => api.users.list({ page, page_size: 20, role: role || undefined, q: search || undefined }) });
  const inst = useQuery({ queryKey: ["institutions-all"], queryFn: () => api.institutions.list({ page_size: 100 }) });
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ full_name: "", email: "", password: "", role: "mentor", institution_id: "" });
  const create = useMutation({ mutationFn: () => api.users.create({ ...f, institution_id: f.institution_id || undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); toast.success("User created"); }, onError: (e) => toast.error(e) });
  const toggle = useMutation({ mutationFn: (u: { id: string; is_active: boolean }) => api.users.update(u.id, { is_active: !u.is_active }), onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }), onError: (e) => toast.error(e) });
  return (
    <>
      <PageHeader title="Users" actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Create user</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Search users" className="max-w-xs" placeholder="Search name or email" onKeyDown={(e) => { if (e.key === "Enter") { setSearch((e.target as HTMLInputElement).value); setPage(1); } }} />
        <Select aria-label="Role" className="max-w-xs" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}><option value="">All roles</option>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select>
      </div>
      <QueryState q={q}>
        {(d) => (<><Table rows={d.items} rowKey={(r) => r.id} columns={[
          { key: "n", header: "Name", render: (r) => <div><div className="font-medium">{r.full_name}</div><div className="text-xs text-subtle">{r.email ?? r.phone}</div></div> },
          { key: "r", header: "Role", render: (r) => <Badge>{titleCase(r.role)}</Badge> },
          { key: "i", header: "Institution", render: (r) => inst.data?.items.find((x) => x.id === r.institution_id)?.name ?? "-" },
          { key: "l", header: "Last login", render: (r) => fmtDateTime(r.last_login_at) },
          { key: "s", header: "Status", render: (r) => <Badge tone={r.is_active ? "success" : "danger"}>{r.is_active ? "active" : "inactive"}</Badge> },
          { key: "x", header: "", render: (r) => r.id !== me.user.id && <Button size="sm" variant="secondary" onClick={() => toggle.mutate(r)}>{r.is_active ? "Deactivate" : "Activate"}</Button> },
        ]} /><Pagination page={page} pageSize={20} total={d.total} onPage={setPage} /></>)}
      </QueryState>
      <Modal open={open} onClose={() => setOpen(false)} title="Create user" footer={<Button loading={create.isPending} onClick={() => create.mutate()}>Create</Button>}>
        <div className="space-y-3">
          <Field label="Full name" htmlFor="un"><Input id="un" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="ue"><Input id="ue" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Temporary password" htmlFor="up"><Input id="up" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
          <Field label="Role" htmlFor="ur"><Select id="ur" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.filter((r) => r !== "student" && (me.user.role === "super_admin" || !["platform_admin", "super_admin"].includes(r))).map((r) => <option key={r} value={r}>{titleCase(r)}</option>)}</Select></Field>
          <Field label="Institution" htmlFor="ui"><Select id="ui" value={f.institution_id} onChange={(e) => setF({ ...f, institution_id: e.target.value })}><option value="">None (platform)</option>{inst.data?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
        </div>
      </Modal>
    </>
  );
}

export function AdminInstitutions() {
  const q = useQuery({ queryKey: ["institutions-all"], queryFn: () => api.institutions.list({ page_size: 100 }) });
  const plans = useQuery({ queryKey: ["plans"], queryFn: () => api.admin.plans() });
  const me = useAuth((s) => s.me)!;
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", code: "" });
  const approve = useMutation({ mutationFn: (id: string) => api.admin.approveTenant(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["institutions-all"] }); toast.success("Institution approved"); } });
  const suspend = useMutation({ mutationFn: (id: string) => api.institutions.update(id, { is_active: false }), onSuccess: () => qc.invalidateQueries({ queryKey: ["institutions-all"] }) });
  const create = useMutation({ mutationFn: () => api.institutions.create(f), onSuccess: () => { qc.invalidateQueries({ queryKey: ["institutions-all"] }); setOpen(false); }, onError: (e) => toast.error(e) });
  const setPlan = useMutation({ mutationFn: (v: { id: string; plan: string }) => api.institutions.setSubscription(v.id, { plan_code: v.plan, seats: plans.data?.find((p) => p.code === v.plan)?.max_students ?? 100 }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["institutions-all"] }); toast.success("Subscription updated"); }, onError: (e) => toast.error(e) });
  return (
    <>
      <PageHeader title="Institutions (tenants)" actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Add institution</Button>} />
      <QueryState q={q}>
        {(d) => <Table rows={d.items} rowKey={(r) => r.id} columns={[
          { key: "n", header: "Institution", render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs text-subtle">{r.code} · since {fmtDate(r.created_at)}</div></div> },
          { key: "s", header: "Students", render: (r) => r.students }, { key: "st", header: "Staff", render: (r) => r.staff },
          { key: "p", header: "Plan", render: (r) => me.user.role === "super_admin"
            ? <Select aria-label="Plan" value={r.subscription?.plan_code ?? ""} onChange={(e) => setPlan.mutate({ id: r.id, plan: e.target.value })}>{plans.data?.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select>
            : r.subscription?.plan_code ?? "-" },
          { key: "a", header: "Status", render: (r) => r.is_active ? <Badge tone="success">active</Badge> : <Badge tone="warning">pending</Badge> },
          { key: "x", header: "", render: (r) => r.is_active ? <Button size="sm" variant="ghost" onClick={() => confirm(`Suspend ${r.name}?`) && suspend.mutate(r.id)}>Suspend</Button> : <Button size="sm" icon={<CheckCircle2 className="size-4" />} onClick={() => approve.mutate(r.id)}>Approve</Button> },
        ]} />}
      </QueryState>
      <Modal open={open} onClose={() => setOpen(false)} title="Add institution" footer={<Button loading={create.isPending} onClick={() => create.mutate()}>Create</Button>}>
        <div className="space-y-3"><Field label="Name" htmlFor="in"><Input id="in" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Code" htmlFor="ic"><Input id="ic" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field></div>
      </Modal>
    </>
  );
}

export function AdminDomains() {
  const q = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const qc = useQueryClient();
  const toast = useToast();
  const [edit, setEdit] = useState<Domain | null>(null);
  const [draft, setDraft] = useState({ name: "", tagline: "", description: "", advantages: "", color: "#171717" });
  const [sub, setSub] = useState<{ domain: string; name: string } | null>(null);
  const save = useMutation({
    mutationFn: () => api.domains.update(edit!.id, { name: draft.name, tagline: draft.tagline, description: draft.description, color: draft.color, advantages: draft.advantages.split("\n").filter(Boolean) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["domains"] }); setEdit(null); toast.success("Domain updated"); }, onError: (e) => toast.error(e),
  });
  const addSub = useMutation({
    mutationFn: () => api.domains.createSubdomain({ domain_id: sub!.domain, name: sub!.name, slug: sub!.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["domains"] }); setSub(null); toast.success("Subdomain added"); }, onError: (e) => toast.error(e),
  });
  const toggleSub = useMutation({ mutationFn: (id: string) => api.domains.updateSubdomain(id, { is_active: false }), onSuccess: () => qc.invalidateQueries({ queryKey: ["domains"] }) });
  return (
    <>
      <PageHeader title="Domain management" subtitle="Six configurable domains with subdomains, advantages and roadmaps." />
      <QueryState q={q}>
        {(list) => <div className="grid gap-4 lg:grid-cols-2">{list.map((d) => (
          <Card key={d.id}><CardHeader title={<span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: d.color }} />{d.name}</span>} subtitle={d.tagline}
            action={<div className="flex gap-1"><Button size="sm" variant="ghost" aria-label="Edit" onClick={() => { setEdit(d); setDraft({ name: d.name, tagline: d.tagline ?? "", description: d.description, advantages: d.advantages.join("\n"), color: d.color }); }}><Pencil className="size-4" /></Button>
              <Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setSub({ domain: d.id, name: "" })}>Subdomain</Button></div>} />
            <CardBody className="flex flex-wrap gap-1.5">{d.subdomains.map((s) => <Badge key={s.id}>{s.name}<button aria-label={`Disable ${s.name}`} className="ml-1 opacity-60 hover:opacity-100" onClick={() => confirm(`Disable ${s.name}?`) && toggleSub.mutate(s.id)}>×</button></Badge>)}</CardBody>
          </Card>))}</div>}
      </QueryState>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Edit ${edit?.name}`} footer={<Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>}>
        <div className="space-y-3">
          <Field label="Name" htmlFor="dn"><Input id="dn" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="Tagline" htmlFor="dt"><Input id="dt" value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} /></Field>
          <Field label="Description" htmlFor="dd"><Textarea id="dd" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
          <Field label="Advantages (one per line)" htmlFor="da"><Textarea id="da" value={draft.advantages} onChange={(e) => setDraft({ ...draft, advantages: e.target.value })} /></Field>
          <Field label="Colour (brand scale)" hint="Domains use shades of the brand palette only." htmlFor="dc">
            <div id="dc" role="radiogroup" className="flex flex-wrap gap-2">{BRAND_SWATCHES.map(([name, hex]) => (
              <button key={hex} type="button" role="radio" aria-checked={draft.color === hex} aria-label={name} title={name} onClick={() => setDraft({ ...draft, color: hex })}
                className={"size-8 rounded-full border-2 " + (draft.color === hex ? "border-[var(--pf-text)] ring-2 ring-[var(--pf-ring)]" : "border-line")} style={{ background: hex }} />))}</div></Field>
        </div>
      </Modal>
      <Modal open={!!sub} onClose={() => setSub(null)} title="Add subdomain" footer={<Button loading={addSub.isPending} disabled={(sub?.name.length ?? 0) < 2} onClick={() => addSub.mutate()}>Add</Button>}>
        <Field label="Name" htmlFor="sn"><Input id="sn" value={sub?.name ?? ""} onChange={(e) => setSub(sub && { ...sub, name: e.target.value })} /></Field>
      </Modal>
    </>
  );
}

export function AdminBroadcast() {
  const toast = useToast();
  const [f, setF] = useState({ title: "", body: "", role: "" });
  const m = useMutation({ mutationFn: () => api.notifications.broadcast({ title: f.title, body: f.body, roles: f.role ? [f.role] : [] }), onSuccess: (r) => { toast.success(r.message); setF({ title: "", body: "", role: "" }); }, onError: (e) => toast.error(e) });
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Broadcast notification" />
      <Card><CardBody className="space-y-4">
        <Field label="Audience" htmlFor="br"><Select id="br" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="">Everyone</option>{ROLES.map((r) => <option key={r} value={r}>{titleCase(r)}s</option>)}</Select></Field>
        <Field label="Title" htmlFor="bt"><Input id="bt" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Message" htmlFor="bb"><Textarea id="bb" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        <div className="flex justify-end"><Button icon={<Megaphone className="size-4" />} loading={m.isPending} disabled={f.title.length < 2 || f.body.length < 2} onClick={() => m.mutate()}>Send</Button></div>
      </CardBody></Card>
    </div>
  );
}
