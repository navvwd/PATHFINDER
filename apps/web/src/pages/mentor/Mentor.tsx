import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, CalendarCheck, CalendarPlus, CalendarX, Inbox, LifeBuoy, MessageCircleQuestion, MessageSquare, Moon, Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Avatar, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, PageHeader, QueryState, Stat, Table, useToast, cx } from "@/components/ui";
import { api, useAuth } from "@/lib/auth";
import { relTime } from "@/lib/format";

const REASON_ICON: Record<string, typeof Inbox> = { inactive: Moon, review_waiting: Inbox, overdue: AlarmClock, attendance: CalendarX, disagreed: MessageCircleQuestion };

export function MentorHome() {
  const me = useAuth((s) => s.me)!;
  const students = useQuery({ queryKey: ["mentor-students"], queryFn: () => api.mentors.students() });
  const queue = useQuery({ queryKey: ["review-queue"], queryFn: () => api.mentors.reviewQueue() });
  const attention = useQuery({ queryKey: ["attention"], queryFn: () => api.mentors.attention() });
  const upcoming = useQuery({ queryKey: ["sessions", "upcoming"], queryFn: () => api.sessions.list({ when: "upcoming", limit: 6 }) });
  const past = useQuery({ queryKey: ["sessions", "past"], queryFn: () => api.sessions.list({ when: "past", limit: 10 }) });
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => api.mentors.batches(), enabled: !!me.mentor_id });
  const toReview = (queue.data?.submissions.length ?? 0) + (queue.data?.attempts.length ?? 0);
  const unmarked = past.data?.filter((s) => s.status !== "cancelled" && s.attendance_marked < s.participants) ?? [];
  const marked = past.data?.filter((s) => s.attendance_marked > 0) ?? [];
  const rate = marked.length ? Math.round(marked.reduce((n, s) => n + s.attended, 0) / Math.max(1, marked.reduce((n, s) => n + s.attendance_marked, 0)) * 100) : null;
  const hour = new Date().getHours();
  return (
    <>
      <PageHeader title={`${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${me.user.full_name.split(" ")[0]}`}
        subtitle="Here's who needs you today."
        actions={<div className="flex flex-wrap gap-2">
          <Link to="/mentor/sessions?new=1"><Button icon={<CalendarPlus className="size-4" />}>Schedule session</Button></Link>
          <Link to="/mentor/activities"><Button variant="secondary" icon={<Plus className="size-4" />}>Assign task</Button></Link>
        </div>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="My students" value={students.data?.length ?? "-"} icon={<Users className="size-4 text-primary-ink" />} />
        <Stat label="Need support" value={attention.data?.length ?? "-"} icon={<LifeBuoy className="size-4 text-primary-ink" />} hint="See list below" />
        <Stat label="Work to review" value={queue.data ? toReview : "-"} icon={<Inbox className="size-4 text-primary-ink" />} hint={queue.data ? `${queue.data.recommendations.length} suggestions to check` : undefined} />
        <Stat label="Attendance (recent)" value={rate == null ? "-" : `${rate}%`} icon={<CalendarCheck className="size-4 text-primary-ink" />} hint={unmarked.length ? `${unmarked.length} session(s) to mark` : "All marked"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Students who need support" subtitle="Based on activity, deadlines, reviews and attendance" action={<Link className="text-sm font-medium text-primary-ink" to="/mentor/students">All students</Link>} />
          <CardBody>
            <QueryState q={attention} isEmpty={(d) => !d.length} empty={<EmptyState title="Everyone is on track" body="No student needs extra support right now." />}>
              {(rows) => (
                <ul className="divide-y divide-line">
                  {rows.slice(0, 8).map((r) => (
                    <li key={r.student_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                      <Link to={`/mentor/students/${r.student_id}`} className="flex min-w-0 flex-1 items-start gap-3">
                        <Avatar name={r.full_name} size={36} />
                        <div className="min-w-0">
                          <div className="font-medium">{r.full_name} <span className="text-xs font-normal text-subtle">{r.age_group}</span></div>
                          <ul className="mt-1 flex flex-wrap gap-1.5">
                            {r.reasons.map((x) => {
                              const Icon = REASON_ICON[x.code] ?? Inbox;
                              return <li key={x.code} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"><Icon className="size-3 text-primary-ink" aria-hidden />{x.text}</li>;
                            })}
                          </ul>
                        </div>
                      </Link>
                      <div className="flex gap-2 sm:shrink-0">
                        <Link to={`/mentor/students/${r.student_id}`}><Button size="sm" variant="secondary">View</Button></Link>
                        <Link to={`/mentor/messages?student=${r.student_id}`}><Button size="sm" variant="ghost" aria-label={`Message about ${r.full_name}`} icon={<MessageSquare className="size-4" />} /></Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Upcoming sessions" action={<Link className="text-sm font-medium text-primary-ink" to="/mentor/sessions">Manage</Link>} />
            <CardBody className="space-y-2">
              {upcoming.data?.slice(0, 4).map((s) => (
                <div key={s.id} className="rounded-xl border border-line p-3 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{s.title}</span>{s.phase === "live" && <Badge tone="primary">Live now</Badge>}</div>
                  <div className="text-xs text-subtle">{new Date(s.starts_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {s.participants} students</div>
                </div>
              ))}
              {upcoming.data && !upcoming.data.length && <p className="text-sm text-subtle">Nothing scheduled.</p>}
              {unmarked.length > 0 && (
                <Link to="/mentor/sessions?tab=past" className="flex items-center gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning"><AlarmClock className="size-4" aria-hidden />{unmarked.length} past session(s) need attendance</Link>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Waiting for your review" action={<Link className="text-sm font-medium text-primary-ink" to="/mentor/reviews">Open queue</Link>} />
            <CardBody className="space-y-1">
              {queue.data?.submissions.slice(0, 5).map((s) => <Link key={s.id} to={`/mentor/reviews/${s.id}`} className="flex items-center justify-between gap-2 rounded-xl p-2 text-sm hover:bg-muted"><span className="truncate"><strong>{s.student_name}</strong> · {s.activity_title}</span><span className="shrink-0 text-xs text-subtle">{relTime(s.submitted_at)}</span></Link>)}
              {queue.data?.attempts.slice(0, 3).map((a) => <Link key={a.id} to={`/mentor/attempts/${a.id}`} className="flex items-center justify-between gap-2 rounded-xl p-2 text-sm hover:bg-muted"><span className="truncate"><strong>{a.student_name}</strong> · {a.assessment_title}</span><Badge>Quiz</Badge></Link>)}
              {queue.data && !toReview && <p className="text-sm text-subtle">Queue is empty.</p>}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card className="mt-6"><CardHeader title="Batches" action={<Link className="text-sm font-medium text-primary-ink" to="/mentor/batches">Manage</Link>} />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{batches.data?.map((b) => <div key={b.id} className="flex items-center justify-between rounded-xl bg-muted p-3 text-sm"><span className="font-medium">{b.name}</span><Badge>{b.student_count} students</Badge></div>)}
          {batches.data && !batches.data.length && <p className="text-sm text-subtle">No batches yet.</p>}</CardBody></Card>
    </>
  );
}

export function MentorStudents() {
  const q = useQuery({ queryKey: ["mentor-students"], queryFn: () => api.mentors.students() });
  const attention = useQuery({ queryKey: ["attention"], queryFn: () => api.mentors.attention() });
  const support = new Map((attention.data ?? []).map((a) => [a.student_id, a]));
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
            { key: "s", header: "Support", render: (r) => { const a = support.get(r.id); return a ? <span className="text-xs" title={a.reasons.map((x) => x.text).join("; ")}><Badge tone="primary">Needs support</Badge> <span className="text-subtle">{a.reasons[0]?.text}</span></span> : <span className="text-xs text-subtle">On track</span>; } },
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
