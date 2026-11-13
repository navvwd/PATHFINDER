import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AttendanceMark, LiveSession } from "@pathfinder/api-client";
import { CalendarCheck, CalendarPlus, CheckCheck, Clock, MapPin, Users, Video, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { AttendanceBadge } from "@/pages/student/Learn";
import { Badge, Button, cx, EmptyState, Field, Input, Modal, PageHeader, QueryState, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { api } from "@/lib/auth";

const MARKS: Array<{ key: AttendanceMark; label: string }> = [
  { key: "present", label: "Present" }, { key: "late", label: "Late" }, { key: "absent", label: "Absent" }, { key: "excused", label: "Excused" },
];

/** Mentor: schedule live sessions, cancel them, and take attendance. */
export function MentorSessions() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as "upcoming" | "past") || "upcoming";
  const [creating, setCreating] = useState(params.get("new") === "1");
  const [marking, setMarking] = useState<LiveSession | null>(null);
  const q = useQuery({ queryKey: ["sessions", tab, "mentor"], queryFn: () => api.sessions.list({ when: tab, limit: 100 }) });
  const qc = useQueryClient();
  const toast = useToast();
  const cancel = useMutation({
    mutationFn: (id: string) => api.sessions.update(id, { status: "cancelled" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); toast.success("Session cancelled - students were notified"); },
    onError: (e) => toast.error(e),
  });
  return (
    <>
      <PageHeader title="Sessions & Attendance" subtitle="Schedule live sessions for a batch or chosen students, then mark who attended."
        actions={<Button icon={<CalendarPlus className="size-4" />} onClick={() => setCreating(true)}>Schedule session</Button>} />
      <Tabs value={tab} onChange={(k) => setParams({ tab: k })} tabs={[{ key: "upcoming", label: "Upcoming" }, { key: "past", label: "Past & attendance" }]} />
      <div className="mt-4">
        <QueryState q={q} isEmpty={(d) => !d.length} empty={<EmptyState icon={<Video className="size-6" />} title={tab === "upcoming" ? "No sessions scheduled" : "No past sessions"} action={tab === "upcoming" ? <Button onClick={() => setCreating(true)}>Schedule one</Button> : undefined} />}>
          {(rows) => (
            <div className="overflow-hidden rounded-[var(--pf-radius)] border border-line bg-surface">
              <ul className="divide-y divide-line">
                {rows.map((s) => {
                  const needs = tab === "past" && s.status !== "cancelled" && s.attendance_marked < s.participants;
                  return (
                    <li key={s.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{s.title}</span>
                          {s.domain_name && <Badge>{s.domain_name}</Badge>}
                          {s.phase === "live" && <Badge tone="primary">Live now</Badge>}
                          {s.status === "cancelled" && <Badge tone="danger"><span className="inline-flex items-center gap-1"><XCircle className="size-3.5" />Cancelled</span></Badge>}
                          {needs && <Badge tone="warning">Attendance needed</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-subtle">
                          <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{new Date(s.starts_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {s.duration_minutes} min</span>
                          <span className="inline-flex items-center gap-1"><Users className="size-3.5" />{s.participants} students</span>
                          {s.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{s.location}</span>}
                          {s.meeting_url && <a className="inline-flex items-center gap-1 text-primary-ink hover:underline" href={s.meeting_url} target="_blank" rel="noopener noreferrer"><Video className="size-3.5" />Meeting link</a>}
                          {tab === "past" && s.attendance_marked > 0 && <span className="inline-flex items-center gap-1"><CalendarCheck className="size-3.5" />{s.attended}/{s.participants} attended</span>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {s.phase !== "upcoming" && s.status !== "cancelled" && <Button size="sm" variant={needs ? "primary" : "secondary"} onClick={() => setMarking(s)}>{needs ? "Mark attendance" : "Edit attendance"}</Button>}
                        {s.phase === "upcoming" && s.status === "scheduled" && <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === s.id}
                          onClick={() => { if (confirm(`Cancel "${s.title}"? Students will be notified.`)) cancel.mutate(s.id); }}>Cancel</Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </QueryState>
      </div>
      <ScheduleModal open={creating} onClose={() => { setCreating(false); if (params.get("new")) setParams({}); }} />
      {marking && <AttendanceModal session={marking} onClose={() => setMarking(null)} />}
    </>
  );
}

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => api.mentors.batches(), enabled: open });
  const students = useQuery({ queryKey: ["mentor-students"], queryFn: () => api.mentors.students(), enabled: open });
  const tomorrow = new Date(Date.now() + 86_400_000); tomorrow.setHours(16, 0, 0, 0);
  const blank = { title: "", description: "", starts: localInput(tomorrow), duration: 45, mode: "online" as "online" | "in_person", link: "", location: "", who: "batch" as "batch" | "students", batch: "", picked: [] as string[] };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setF(blank); setErr(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const qc = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: () => api.sessions.create({
      title: f.title.trim(), description: f.description.trim() || undefined, starts_at: new Date(f.starts).toISOString(), duration_minutes: f.duration,
      meeting_url: f.mode === "online" ? f.link.trim() : undefined, location: f.mode === "in_person" ? f.location.trim() : undefined,
      batch_id: f.who === "batch" ? f.batch || batches.data?.[0]?.id : undefined, student_ids: f.who === "students" ? f.picked : [],
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); toast.success("Session scheduled - students and parents were notified"); onClose(); },
    onError: (e) => setErr(e instanceof Error ? e.message : "Could not schedule"),
  });
  const valid = f.title.trim().length >= 3 && !!f.starts && (f.mode === "online" ? /^https?:\/\//.test(f.link.trim()) : f.location.trim().length > 1)
    && (f.who === "batch" ? !!(f.batch || batches.data?.[0]) : f.picked.length > 0) && new Date(f.starts).getTime() > Date.now();
  return (
    <Modal open={open} onClose={onClose} title="Schedule a live session" wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>Schedule</Button></>}>
      <div className="space-y-4">
        {err && <div role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{err}</div>}
        <Field label="Title" htmlFor="st"><Input id="st" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Weekly check-in" maxLength={200} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date & time" htmlFor="sd" hint="Shown to students in their own timezone"><Input id="sd" type="datetime-local" value={f.starts} onChange={(e) => setF({ ...f, starts: e.target.value })} /></Field>
          <Field label="Duration" htmlFor="sdur"><Select id="sdur" value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })}>{[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}</Select></Field>
        </div>
        <Field label="Where">
          <Tabs value={f.mode} onChange={(k) => setF({ ...f, mode: k })} tabs={[{ key: "online", label: "Online" }, { key: "in_person", label: "In person" }]} />
        </Field>
        {f.mode === "online"
          ? <Field label="Meeting link" htmlFor="sl" hint="Students see the link 15 minutes before start"><Input id="sl" type="url" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://..." /></Field>
          : <Field label="Location" htmlFor="sloc"><Input id="sloc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="e.g. Lab 2" /></Field>}
        <Field label="Who is invited">
          <Tabs value={f.who} onChange={(k) => setF({ ...f, who: k })} tabs={[{ key: "batch", label: "A batch" }, { key: "students", label: "Chosen students" }]} />
        </Field>
        {f.who === "batch" ? (
          <Select aria-label="Batch" value={f.batch || batches.data?.[0]?.id || ""} onChange={(e) => setF({ ...f, batch: e.target.value })}>
            {batches.data?.length ? batches.data.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.student_count})</option>) : <option value="">No batches yet</option>}
          </Select>
        ) : (
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
            {students.data?.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted">
                <input type="checkbox" className="size-4 accent-[var(--pf-primary)]" checked={f.picked.includes(s.id)}
                  onChange={(e) => setF({ ...f, picked: e.target.checked ? [...f.picked, s.id] : f.picked.filter((x) => x !== s.id) })} />{s.full_name}
              </label>
            ))}
          </div>
        )}
        <Field label="Note for students (optional)" htmlFor="sdesc"><Textarea id="sdesc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} /></Field>
      </div>
    </Modal>
  );
}

function AttendanceModal({ session, onClose }: { session: LiveSession; onClose: () => void }) {
  const q = useQuery({ queryKey: ["attendance", session.id], queryFn: () => api.sessions.attendance(session.id) });
  const [marks, setMarks] = useState<Record<string, AttendanceMark>>({});
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (q.data) setMarks(Object.fromEntries(q.data.records.map((r) => [r.student_id, r.attendance]))); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.sessions.markAttendance(session.id, Object.entries(marks).map(([student_id, attendance]) => ({ student_id, attendance }))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); qc.invalidateQueries({ queryKey: ["attention"] }); toast.success("Attendance saved"); onClose(); },
    onError: (e) => toast.error(e),
  });
  const pending = Object.values(marks).filter((m) => m === "pending").length;
  return (
    <Modal open onClose={onClose} title={`Attendance · ${session.title}`} wide
      footer={<><span className="mr-auto text-sm text-subtle">{pending ? `${pending} not marked` : "Everyone marked"}</span><Button variant="ghost" onClick={onClose}>Close</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save attendance</Button></>}>
      <QueryState q={q}>
        {(d) => (
          <div className="space-y-3">
            <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} onClick={() => setMarks(Object.fromEntries(d.records.map((r) => [r.student_id, "present" as AttendanceMark])))}>Mark everyone present</Button>
            <ul className="divide-y divide-line">
              {d.records.map((r) => (
                <li key={r.student_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <span className="flex-1 text-sm font-medium">{r.full_name}</span>
                  <AttendanceBadge mark={marks[r.student_id] ?? "pending"} />
                  <div role="radiogroup" aria-label={`Attendance for ${r.full_name}`} className="flex flex-wrap gap-1">
                    {MARKS.map((m) => (
                      <button key={m.key} type="button" role="radio" aria-checked={marks[r.student_id] === m.key} onClick={() => setMarks({ ...marks, [r.student_id]: m.key })}
                        className={cx("rounded-full border px-3 py-1 text-xs font-medium transition", marks[r.student_id] === m.key ? "border-inverse bg-inverse text-on-inverse" : "border-line hover:bg-muted")}>{m.label}</button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </QueryState>
    </Modal>
  );
}
