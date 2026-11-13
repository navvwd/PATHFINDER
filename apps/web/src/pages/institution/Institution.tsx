import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarDays, FileText, GraduationCap, Plus, Upload, Users } from "lucide-react";
import { useState } from "react";
import { SimpleBars } from "@/components/charts";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, PageHeader, QueryState, Select, Stat, Table, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/format";

const useInstitution = () => useQuery({ queryKey: ["institution-me"], queryFn: () => api.institutions.me() });

export function InstitutionHome() {
  const inst = useInstitution();
  const analytics = useQuery({ queryKey: ["inst-analytics", inst.data?.id], enabled: !!inst.data, queryFn: () => api.institutions.analytics(inst.data!.id) });
  const sub = useQuery({ queryKey: ["inst-sub", inst.data?.id], enabled: !!inst.data, queryFn: () => api.institutions.subscription(inst.data!.id) });
  return (
    <QueryState q={inst} empty={<EmptyState title="No institution" />}>
      {(i) => (
        <>
          <PageHeader title={i.name} subtitle={`Code ${i.code} · ${i.is_active ? "Active" : "Pending approval"}`} />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Students" value={i.students} icon={<GraduationCap className="size-4 text-primary-ink" />} />
            <Stat label="Staff" value={i.staff} icon={<Users className="size-4 text-primary-ink" />} />
            <Stat label="Active (30 days)" value={analytics.data?.active_students_30d ?? "-"} />
            <Stat label="Plan" value={i.subscription?.plan_code ?? "-"} hint={i.subscription ? `${(sub.data?.seats_used as number) ?? "-"} / ${i.subscription.seats} seats` : undefined} />
          </div>
          <QueryState q={analytics}>
            {(a) => (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <Card><CardHeader title="Domain interest" subtitle="Students who chose each domain" /><CardBody><SimpleBars data={a.domain_participation.map((d) => ({ name: d.domain.split(" ")[0]!, value: d.interested_students, color: d.color }))} /></CardBody></Card>
                <Card><CardHeader title="Domain participation" subtitle="Students with any activity in each domain" /><CardBody><SimpleBars data={a.domain_participation.map((d) => ({ name: d.domain.split(" ")[0]!, value: d.participating_students, color: d.color }))} /></CardBody></Card>
                <Card className="lg:col-span-2"><CardHeader title="Aggregate demonstrated skill" subtitle={a.note} /><CardBody>
                  <Table rows={a.domain_participation} rowKey={(r) => r.domain_id} columns={[
                    { key: "d", header: "Domain", render: (r) => <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: r.color }} />{r.domain}</span> },
                    { key: "i", header: "Interested", render: (r) => r.interested_students },
                    { key: "p", header: "Participating", render: (r) => r.participating_students },
                    { key: "a", header: "Sufficiently assessed", render: (r) => r.assessed_students },
                    { key: "s", header: "Avg skill (assessed only)", render: (r) => r.average_skill_score ?? "-" },
                  ]} />
                </CardBody></Card>
              </div>
            )}
          </QueryState>
        </>
      )}
    </QueryState>
  );
}

export function InstitutionStructure() {
  const inst = useInstitution();
  const id = inst.data?.id ?? "";
  const qc = useQueryClient();
  const toast = useToast();
  const campuses = useQuery({ queryKey: ["campuses", id], enabled: !!id, queryFn: () => api.institutions.campuses(id) });
  const years = useQuery({ queryKey: ["years", id], enabled: !!id, queryFn: () => api.institutions.years(id) });
  const classes = useQuery({ queryKey: ["classes", id], enabled: !!id, queryFn: () => api.institutions.classes(id) });
  const activities = useQuery({ queryKey: ["activities", "all"], queryFn: () => api.activities.list({ page_size: 100 }) });
  const [modal, setModal] = useState<"campus" | "year" | "class" | "distribute" | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const done = (k: string, msg: string) => { qc.invalidateQueries({ queryKey: [k, id] }); setModal(null); setF({}); toast.success(msg); };
  const save = useMutation({
    mutationFn: async () => {
      if (modal === "campus") { await api.institutions.addCampus(id, { name: f.name!, address: f.address }); return done("campuses", "Campus added"); }
      if (modal === "year") { await api.institutions.addYear(id, { label: f.label!, starts_on: f.starts_on!, ends_on: f.ends_on!, is_current: f.current === "yes" }); return done("years", "Academic year added"); }
      if (modal === "class") { await api.institutions.addClass(id, { name: f.name!, grade: f.grade!, section: f.section }); return done("classes", "Class added"); }
      if (modal === "distribute") { const r = await api.institutions.distribute(id, { activity_id: f.activity!, class_id: f.class! }); return done("classes", `Assigned to ${r.assigned} student(s)`); }
    },
    onError: (e) => toast.error(e),
  });
  const input = (k: string, label: string, type = "text") => <Field label={label} htmlFor={k}><Input id={k} type={type} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <>
      <PageHeader title="Campuses, years & classes" actions={<Button variant="secondary" onClick={() => setModal("distribute")}>Distribute activity to class</Button>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="Campuses" action={<Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setModal("campus")}>Add</Button>} />
          <CardBody className="space-y-2">{campuses.data?.map((c) => <div key={c.id} className="flex items-center gap-2 text-sm"><Building2 className="size-4 text-subtle" />{c.name}</div>)}</CardBody></Card>
        <Card><CardHeader title="Academic years" action={<Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setModal("year")}>Add</Button>} />
          <CardBody className="space-y-2">{years.data?.map((y) => <div key={y.id} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><CalendarDays className="size-4 text-subtle" />{y.label}</span>{y.is_current && <Badge tone="success">current</Badge>}</div>)}</CardBody></Card>
        <Card><CardHeader title="Classes" action={<Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setModal("class")}>Add</Button>} />
          <CardBody className="space-y-2">{classes.data?.map((c) => <div key={c.id} className="flex justify-between text-sm"><span>{c.name}</span><Badge>{c.students} students</Badge></div>)}</CardBody></Card>
      </div>
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "distribute" ? "Distribute activity" : `Add ${modal}`} footer={<Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button>}>
        <div className="space-y-3">
          {modal === "campus" && <>{input("name", "Name")}{input("address", "Address")}</>}
          {modal === "year" && <>{input("label", "Label (e.g. 2026-27)")}{input("starts_on", "Starts", "date")}{input("ends_on", "Ends", "date")}
            <Field label="Current year?" htmlFor="cur"><Select id="cur" value={f.current ?? "no"} onChange={(e) => setF({ ...f, current: e.target.value })}><option value="no">No</option><option value="yes">Yes</option></Select></Field></>}
          {modal === "class" && <>{input("name", "Name")}{input("grade", "Grade")}{input("section", "Section")}</>}
          {modal === "distribute" && <>
            <Field label="Activity" htmlFor="da"><Select id="da" value={f.activity ?? ""} onChange={(e) => setF({ ...f, activity: e.target.value })}><option value="">Choose</option>{activities.data?.items.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}</Select></Field>
            <Field label="Class" htmlFor="dc"><Select id="dc" value={f.class ?? ""} onChange={(e) => setF({ ...f, class: e.target.value })}><option value="">Choose</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field></>}
        </div>
      </Modal>
    </>
  );
}

export function InstitutionPeople() {
  const inst = useInstitution();
  const id = inst.data?.id ?? "";
  const staff = useQuery({ queryKey: ["staff", id], enabled: !!id, queryFn: () => api.institutions.staff(id) });
  const students = useQuery({ queryKey: ["institution-students"], queryFn: () => api.students.list({ page_size: 100 }) });
  const classes = useQuery({ queryKey: ["classes", id], enabled: !!id, queryFn: () => api.institutions.classes(id) });
  const qc = useQueryClient();
  const toast = useToast();
  const [modal, setModal] = useState<"staff" | "import" | "allocate" | null>(null);
  const [s, setS] = useState({ full_name: "", email: "", password: "", role: "teacher" });
  const [file, setFile] = useState<File | null>(null);
  const [cls, setCls] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.institutions.importStudents>> | null>(null);
  const [alloc, setAlloc] = useState<{ mentor: string; name: string; ids: string[] }>({ mentor: "", name: "", ids: [] });
  const addStaff = useMutation({ mutationFn: () => api.institutions.addStaff(id, s), onSuccess: () => { qc.invalidateQueries({ queryKey: ["staff", id] }); setModal(null); toast.success("Staff account created"); }, onError: (e) => toast.error(e) });
  const imp = useMutation({ mutationFn: () => api.institutions.importStudents(id, file!, cls || undefined), onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ["institution-students"] }); }, onError: (e) => toast.error(e) });
  const allocate = useMutation({ mutationFn: () => api.institutions.allocate(id, { mentor_id: alloc.mentor, batch_name: alloc.name, student_ids: alloc.ids }), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["staff", id] }); setModal(null); toast.success(`Allocated ${r.students} student(s)`); }, onError: (e) => toast.error(e) });
  return (
    <>
      <PageHeader title="Staff & students" actions={<>
        <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => { setResult(null); setModal("import"); }}>Import students (CSV)</Button>
        <Button variant="secondary" onClick={() => setModal("allocate")}>Allocate mentor</Button>
        <Button icon={<Plus className="size-4" />} onClick={() => setModal("staff")}>Add staff</Button></>} />
      <h2 className="mb-3 font-semibold">Teachers & mentors</h2>
      <QueryState q={staff}>{(d) => <Table rows={d} rowKey={(r) => r.mentor_id} columns={[
        { key: "n", header: "Name", render: (r) => r.full_name }, { key: "e", header: "Email", render: (r) => r.email },
        { key: "r", header: "Role", render: (r) => <Badge>{r.role.replace("_", " ")}</Badge> }, { key: "s", header: "Students", render: (r) => r.students },
      ]} />}</QueryState>
      <h2 className="mb-3 mt-8 font-semibold">Students</h2>
      <QueryState q={students}>{(d) => <Table rows={d.items} rowKey={(r) => r.id} columns={[
        { key: "n", header: "Name", render: (r) => r.full_name }, { key: "a", header: "Age group", render: (r) => r.age_group ?? "-" },
        { key: "g", header: "Grade", render: (r) => r.grade ?? "-" }, { key: "o", header: "Onboarded", render: (r) => <Badge tone={r.onboarding_complete ? "success" : "warning"}>{r.onboarding_complete ? "yes" : "no"}</Badge> },
      ]} />}</QueryState>
      <Modal open={modal === "staff"} onClose={() => setModal(null)} title="Add staff" footer={<Button loading={addStaff.isPending} onClick={() => addStaff.mutate()}>Create</Button>}>
        <div className="space-y-3">
          <Field label="Full name" htmlFor="sn"><Input id="sn" value={s.full_name} onChange={(e) => setS({ ...s, full_name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="se"><Input id="se" type="email" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} /></Field>
          <Field label="Temporary password" htmlFor="sp"><Input id="sp" type="password" value={s.password} onChange={(e) => setS({ ...s, password: e.target.value })} /></Field>
          <Field label="Role" htmlFor="sr"><Select id="sr" value={s.role} onChange={(e) => setS({ ...s, role: e.target.value })}><option value="teacher">Teacher</option><option value="mentor">Mentor</option><option value="institution_admin">Institution admin</option></Select></Field>
        </div>
      </Modal>
      <Modal wide open={modal === "import"} onClose={() => setModal(null)} title="Import students from CSV" footer={!result && <Button loading={imp.isPending} disabled={!file} onClick={() => imp.mutate()}>Import</Button>}>
        {result ? (
          <div className="space-y-3 text-sm">
            <p><strong>{result.created.length}</strong> created, <strong>{result.errors.length}</strong> errors. {result.note}</p>
            {result.created.length > 0 && <Table rows={result.created} rowKey={(r) => String(r.row)} columns={[{ key: "n", header: "Name", render: (r) => r.full_name }, { key: "e", header: "Email", render: (r) => r.email }, { key: "p", header: "Temp password", render: (r) => <code>{r.temporary_password}</code> }]} />}
            {result.errors.map((e) => <p key={e.row} className="text-danger">Row {e.row}: {e.error}</p>)}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-subtle">Columns: <code>full_name,email,date_of_birth,grade</code> (date as YYYY-MM-DD). Max 1000 rows.</p>
            <Input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Field label="Enrol into class (optional)" htmlFor="ic"><Select id="ic" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">-</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          </div>
        )}
      </Modal>
      <Modal open={modal === "allocate"} onClose={() => setModal(null)} title="Allocate students to a mentor" footer={<Button loading={allocate.isPending} disabled={!alloc.mentor || alloc.name.length < 2 || !alloc.ids.length} onClick={() => allocate.mutate()}>Allocate</Button>}>
        <div className="space-y-3">
          <Field label="Mentor" htmlFor="am"><Select id="am" value={alloc.mentor} onChange={(e) => setAlloc({ ...alloc, mentor: e.target.value })}><option value="">Choose</option>{staff.data?.map((m) => <option key={m.mentor_id} value={m.mentor_id}>{m.full_name}</option>)}</Select></Field>
          <Field label="Batch name" htmlFor="abn"><Input id="abn" value={alloc.name} onChange={(e) => setAlloc({ ...alloc, name: e.target.value })} /></Field>
          <div className="max-h-56 space-y-1 overflow-y-auto">{students.data?.items.map((st) => <label key={st.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alloc.ids.includes(st.id)} onChange={() => setAlloc({ ...alloc, ids: alloc.ids.includes(st.id) ? alloc.ids.filter((x) => x !== st.id) : [...alloc.ids, st.id] })} />{st.full_name}</label>)}</div>
        </div>
      </Modal>
    </>
  );
}

export function InstitutionReports() {
  const inst = useInstitution();
  const id = inst.data?.id ?? "";
  const q = useQuery({ queryKey: ["inst-reports", id], enabled: !!id, queryFn: () => api.reports.list({ institution_id: id }) });
  const sub = useQuery({ queryKey: ["inst-sub", id], enabled: !!id, queryFn: () => api.institutions.subscription(id) });
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const gen = useMutation({ mutationFn: () => api.reports.institution(id), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["inst-reports", id] }); setOpen(r.id); }, onError: (e) => toast.error(e) });
  const report = q.data?.items.find((r) => r.id === open);
  const subscription = sub.data?.subscription as { plan_code: string; status: string; seats: number; ends_on: string | null } | null | undefined;
  return (
    <>
      <PageHeader title="Reports & subscription" actions={<Button icon={<FileText className="size-4" />} loading={gen.isPending} onClick={() => gen.mutate()}>Generate participation report</Button>} />
      {subscription && <Card className="mb-6 p-4 text-sm">Plan <Badge tone="primary">{subscription.plan_code}</Badge> · {subscription.status} · {sub.data?.seats_used as number}/{subscription.seats} seats{subscription.ends_on && ` · renews ${fmtDate(subscription.ends_on)}`}</Card>}
      <QueryState q={q} isEmpty={(d) => !d.items.length} empty={<EmptyState title="No institutional reports yet" />}>
        {(d) => <Card className="divide-y divide-line">{d.items.map((r) => <button key={r.id} onClick={() => setOpen(r.id)} className="flex w-full justify-between px-5 py-3 text-left text-sm hover:bg-muted"><span>{r.title}</span><span className="text-xs text-subtle">{fmtDateTime(r.created_at)}</span></button>)}</Card>}
      </QueryState>
      <Modal wide open={!!report} onClose={() => setOpen(null)} title={report?.title ?? ""}>
        {report && <div className="space-y-2 text-sm">
          <p>{(report.content as { note?: string }).note}</p>
          <Table rows={(report.content as { domain_participation: Array<{ domain_id: string; domain: string; interested_students: number; participating_students: number; average_skill_score: number | null }> }).domain_participation} rowKey={(r) => r.domain_id}
            columns={[{ key: "d", header: "Domain", render: (r) => r.domain }, { key: "i", header: "Interested", render: (r) => r.interested_students }, { key: "p", header: "Participating", render: (r) => r.participating_students }, { key: "s", header: "Avg skill", render: (r) => r.average_skill_score ?? "-" }]} />
        </div>}
      </Modal>
    </>
  );
}
