import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Inbox, Plus, Target, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Avatar, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, PageHeader, QueryState, Stat, Table, useToast, cx } from "@/components/ui";
import { api, useAuth } from "@/lib/auth";
import { relTime } from "@/lib/format";

export function MentorHome() {
  const me = useAuth((s) => s.me)!;
  const students = useQuery({ queryKey: ["mentor-students"], queryFn: () => api.mentors.students() });
  const queue = useQuery({ queryKey: ["review-queue"], queryFn: () => api.mentors.reviewQueue() });
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => api.mentors.batches(), enabled: !!me.mentor_id });
  return (
    <>
      <PageHeader title={`Welcome, ${me.user.full_name.split(" ")[0]}`} subtitle="Your mentoring workspace" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Students" value={students.data?.length ?? "-"} icon={<Users className="size-4 text-primary-ink" />} />
        <Stat label="Submissions to review" value={queue.data?.submissions.length ?? "-"} icon={<Inbox className="size-4 text-warning" />} />
        <Stat label="Assessments to grade" value={queue.data?.attempts.length ?? "-"} icon={<ClipboardCheck className="size-4 text-info" />} />
        <Stat label="Suggestions to review" value={queue.data?.recommendations.length ?? "-"} icon={<Target className="size-4 text-success" />} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Waiting for review" action={<Link className="text-sm text-primary-ink" to="/mentor/reviews">Open queue</Link>} />
          <CardBody className="space-y-2">
            {queue.data?.submissions.slice(0, 6).map((s) => <Link key={s.id} to={`/mentor/reviews/${s.id}`} className="flex items-center justify-between rounded-xl p-2 text-sm hover:bg-muted"><span><strong>{s.student_name}</strong> · {s.activity_title}</span><span className="text-xs text-subtle">{relTime(s.submitted_at)}</span></Link>)}
            {queue.data && !queue.data.submissions.length && <p className="text-sm text-subtle">Queue is empty.</p>}
          </CardBody></Card>
        <Card><CardHeader title="Batches" action={<Link className="text-sm text-primary-ink" to="/mentor/batches">Manage</Link>} />
          <CardBody className="space-y-2">{batches.data?.map((b) => <div key={b.id} className="flex justify-between rounded-xl bg-muted p-3 text-sm"><span>{b.name}</span><Badge>{b.student_count} students</Badge></div>)}
            {batches.data && !batches.data.length && <p className="text-sm text-subtle">No batches yet.</p>}</CardBody></Card>
      </div>
    </>
  );
}

export function MentorStudents() {
  const q = useQuery({ queryKey: ["mentor-students"], queryFn: () => api.mentors.students() });
  const [filter, setFilter] = useState("");
  const navigate = useNavigate();
  return (
    <>
      <PageHeader title="Students" subtitle="Students you mentor or teach. Individual students are never ranked against each other." />
      <Input aria-label="Filter students" className="mb-4 max-w-sm" placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <QueryState q={q} isEmpty={(d) => !d.length} empty={<EmptyState title="No students assigned" body="Create a batch or ask your institution admin to allocate students." />}>
        {(d) => (
          <Table rows={d.filter((s) => s.full_name.toLowerCase().includes(filter.toLowerCase()))} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/mentor/students/${r.id}`)} columns={[
            { key: "n", header: "Student", render: (r) => <span className="flex items-center gap-2"><Avatar name={r.full_name} size={28} />{r.full_name}</span> },
            { key: "a", header: "Age group", render: (r) => r.age_group ?? "-" },
            { key: "g", header: "Grade", render: (r) => r.grade ?? "-" },
            { key: "o", header: "Onboarding", render: (r) => <Badge tone={r.onboarding_complete ? "success" : "warning"}>{r.onboarding_complete ? "Complete" : "In progress"}</Badge> },
            { key: "p", header: "Pending reviews", render: (r) => r.pending_reviews ? <Badge tone="warning">{r.pending_reviews}</Badge> : "-" },
          ]} />
        )}
      </QueryState>
    </>
  );
}

export function Batches() {
  const me = useAuth((s) => s.me)!;
  const q = useQuery({ queryKey: ["batches"], queryFn: () => api.mentors.batches() });
  const students = useQuery({ queryKey: ["institution-students"], queryFn: () => api.students.list({ page_size: 100 }) });
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; ids: string[] }>({ name: "", ids: [] });
  const [addTo, setAddTo] = useState<string | null>(null);
  const create = useMutation({ mutationFn: () => api.mentors.createBatch({ name: form.name, student_ids: form.ids }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["batches"] }); setOpen(false); setForm({ name: "", ids: [] }); toast.success("Batch created"); }, onError: (e) => toast.error(e) });
  const add = useMutation({ mutationFn: () => api.mentors.addMembers(addTo!, form.ids), onSuccess: () => { qc.invalidateQueries({ queryKey: ["batches"] }); setAddTo(null); setForm({ name: "", ids: [] }); }, onError: (e) => toast.error(e) });
  const remove = useMutation({ mutationFn: (v: { b: string; s: string }) => api.mentors.removeMember(v.b, v.s), onSuccess: () => qc.invalidateQueries({ queryKey: ["batches"] }) });
  if (!me.mentor_id) return <EmptyState title="Batches are for mentors and teachers" />;
  const picker = (
    <div className="max-h-72 space-y-1 overflow-y-auto">
      {students.data?.items.map((s) => (
        <label key={s.id} className={cx("flex items-center gap-2 rounded-lg p-2 text-sm", form.ids.includes(s.id) && "bg-primary-soft")}>
          <input type="checkbox" checked={form.ids.includes(s.id)} onChange={() => setForm({ ...form, ids: form.ids.includes(s.id) ? form.ids.filter((x) => x !== s.id) : [...form.ids, s.id] })} />{s.full_name} <span className="text-xs text-subtle">{s.age_group}</span>
        </label>
      ))}
    </div>
  );
  return (
    <>
      <PageHeader title="Batches" subtitle="Group students to assign activities and track progress together." actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New batch</Button>} />
      <QueryState q={q} isEmpty={(d) => !d.length} empty={<EmptyState title="No batches yet" action={<Button onClick={() => setOpen(true)}>Create batch</Button>} />}>
        {(d) => <div className="grid gap-4 lg:grid-cols-2">{d.map((b) => (
          <Card key={b.id}><CardHeader title={b.name} subtitle={`${b.student_count} students`} action={<Button size="sm" variant="soft" onClick={() => { setForm({ name: "", ids: [] }); setAddTo(b.id); }}>Add students</Button>} />
            <CardBody className="space-y-1">{b.students.map((s) => <div key={s.id} className="flex items-center justify-between rounded-lg p-1.5 text-sm hover:bg-muted"><Link to={`/mentor/students/${s.id}`} className="hover:text-primary-ink">{s.full_name}</Link><button aria-label={`Remove ${s.full_name}`} onClick={() => remove.mutate({ b: b.id, s: s.id })}><Trash2 className="size-4 text-subtle hover:text-danger" /></button></div>)}</CardBody>
          </Card>))}</div>}
      </QueryState>
      <Modal open={open} onClose={() => setOpen(false)} title="New batch" footer={<Button loading={create.isPending} disabled={form.name.length < 2} onClick={() => create.mutate()}>Create</Button>}>
        <Field label="Batch name" htmlFor="bn"><Input id="bn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <div className="mt-4 text-sm font-medium">Students</div>{picker}
      </Modal>
      <Modal open={!!addTo} onClose={() => setAddTo(null)} title="Add students" footer={<Button loading={add.isPending} disabled={!form.ids.length} onClick={() => add.mutate()}>Add</Button>}>{picker}</Modal>
    </>
  );
}
