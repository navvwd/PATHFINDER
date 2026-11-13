import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Domain } from "@pathfinder/shared-types";
import { CheckCircle2, Megaphone, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { SimpleBars } from "@/components/charts";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Modal, PageHeader, Pagination, QueryState, Select, Stat, Table, Textarea, useToast } from "@/components/ui";
import { api, useAuth } from "@/lib/auth";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";

export function AdminHome() {
  const o = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.admin.overview() });
  const p = useQuery({ queryKey: ["platform-analytics"], queryFn: () => api.analytics.platform(), retry: false });
  return (
    <>
      <PageHeader title="Administration" subtitle="Platform health and activity" />
      <QueryState q={o}>
        {(d) => {
          const users = d.users as Record<string, number>;
          const inst = d.institutions as { active: number; pending: number };
          return (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Students" value={users.student ?? 0} /><Stat label="Guardians" value={users.guardian ?? 0} />
                <Stat label="Institutions" value={inst.active} hint={`${inst.pending} pending approval`} /><Stat label="Sign-ups (7d)" value={d.signups_7d as number} />
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Card><CardHeader title="Users by role" /><CardBody><SimpleBars data={Object.entries(users).map(([k, v]) => ({ name: titleCase(k).split(" ")[0]!, value: v }))} /></CardBody></Card>
                {p.data && <Card><CardHeader title="Domain interest (all students)" /><CardBody><SimpleBars data={(p.data.domain_interest as Array<{ domain: string; students: number }>).map((x) => ({ name: x.domain.split(" ")[0]!, value: x.students }))} /></CardBody></Card>}
              </div>
              {p.data && <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Active students (30d)" value={p.data.active_students_30d as number} /><Stat label="Submissions (30d)" value={p.data.submissions_30d as number} />
                <Stat label="Assessment attempts (30d)" value={p.data.attempts_30d as number} /><Stat label="AI requests (7d)" value={d.ai_requests_7d as number} /></div>}
            </>
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
  const [draft, setDraft] = useState({ name: "", tagline: "", description: "", advantages: "", color: "#6366f1" });
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
          <Field label="Colour" htmlFor="dc"><Input id="dc" type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} /></Field>
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
