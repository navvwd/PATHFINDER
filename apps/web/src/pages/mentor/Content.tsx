import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Activity } from "@pathfinder/shared-types";
import { categoryLabels } from "@pathfinder/design-system";
import { activitySchema, type ActivityInput } from "@pathfinder/validation";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Pagination, QueryState, Select, Table, Textarea, useToast } from "@/components/ui";
import { api, can, useAuth } from "@/lib/auth";
import { titleCase } from "@/lib/format";

export function ActivityManager() {
  const me = useAuth((s) => s.me);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["manage-activities", page, search], queryFn: () => api.activities.list({ page, page_size: 15, q: search || undefined }) });
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const [editing, setEditing] = useState<Activity | "new" | null>(null);
  const [assigning, setAssigning] = useState<Activity | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const archive = useMutation({ mutationFn: (id: string) => api.activities.archive(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["manage-activities"] }); toast.success("Archived"); }, onError: (e) => toast.error(e) });
  const editable = (a: Activity) => me?.user.role === "super_admin" || me?.user.role === "platform_admin" || (!!a.institution_id && a.institution_id === me?.user.institution_id);
  return (
    <>
      <PageHeader title="Activities" subtitle="Create, edit and assign activities. Platform activities are shared with every institution."
        actions={can(me, "activities:manage") && <Button icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>New activity</Button>} />
      <Input aria-label="Search" className="mb-4 max-w-sm" placeholder="Search activities and press Enter" onKeyDown={(e) => { if (e.key === "Enter") { setSearch((e.target as HTMLInputElement).value); setPage(1); } }} />
      <QueryState q={q} isEmpty={(d) => !d.items.length} empty={<EmptyState title="No activities" />}>
        {(d) => (<>
          <Table rows={d.items} rowKey={(r) => r.id} columns={[
            { key: "t", header: "Title", render: (r) => <div><div className="font-medium">{r.title}</div><div className="text-xs text-subtle">{r.domain_name} · {categoryLabels[r.category]}</div></div> },
            { key: "d", header: "Level", render: (r) => r.difficulty },
            { key: "a", header: "Ages", render: (r) => `${r.min_age}-${r.max_age}` },
            { key: "s", header: "Status", render: (r) => <Badge tone={r.status === "published" ? "success" : "neutral"}>{r.status}</Badge> },
            { key: "o", header: "Owner", render: (r) => (r.institution_id ? "Institution" : "Platform") },
            { key: "x", header: "", render: (r) => <div className="flex justify-end gap-1">
              <Button size="sm" variant="soft" icon={<Send className="size-3.5" />} onClick={() => setAssigning(r)}>Assign</Button>
              {editable(r) && <><Button size="sm" variant="ghost" aria-label="Edit" onClick={() => setEditing(r)}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" aria-label="Archive" onClick={() => confirm("Archive this activity? Submission history is kept.") && archive.mutate(r.id)}><Trash2 className="size-4" /></Button></>}
            </div> },
          ]} />
          <Pagination page={page} pageSize={15} total={d.total} onPage={setPage} />
        </>)}
      </QueryState>
      {editing && <ActivityForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} domains={domains.data ?? []} onClose={() => setEditing(null)} />}
      {assigning && <AssignModal a={assigning} onClose={() => setAssigning(null)} />}
    </>
  );
}

type DomainLite = { id: string; name: string; subdomains: Array<{ id: string; name: string }> };

function ActivityForm({ initial, domains, onClose }: { initial: Activity | null; domains: DomainLite[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const rubrics = useQuery({ queryKey: ["rubrics"], queryFn: () => api.activities.rubrics() });
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<ActivityInput>({
    resolver: zodResolver(activitySchema),
    defaultValues: initial ? {
      title: initial.title, domain_id: initial.domain_id, subdomain_id: initial.subdomain_id ?? "", category: initial.category as ActivityInput["category"],
      description: initial.description, instructions: initial.instructions, difficulty: initial.difficulty, min_age: initial.min_age, max_age: initial.max_age,
      estimated_minutes: initial.estimated_minutes, submission_type: initial.submission_type as ActivityInput["submission_type"], max_score: initial.max_score,
      xp_reward: initial.xp_reward, rubric_id: initial.rubric_id ?? "", status: initial.status as ActivityInput["status"],
    } : { category: "practical_project", difficulty: 2, min_age: 9, max_age: 17, estimated_minutes: 45, submission_type: "mixed", max_score: 100, xp_reward: 30, status: "published", domain_id: "", subdomain_id: "", rubric_id: "" },
  });
  const dom = domains.find((d) => d.id === watch("domain_id"));
  const submit = async (v: ActivityInput) => {
    const body = { ...v, subdomain_id: v.subdomain_id || null, rubric_id: v.rubric_id || null, evaluation_criteria: initial?.evaluation_criteria ?? [] };
    try {
      if (initial) {
        const { domain_id, ...rest } = body;
        void domain_id;
        await api.activities.update(initial.id, rest);
      } else await api.activities.create(body);
      qc.invalidateQueries({ queryKey: ["manage-activities"] });
      toast.success(initial ? "Activity updated" : "Activity created");
      onClose();
    } catch (e) { toast.error(e); }
  };
  return (
    <Modal wide open onClose={onClose} title={initial ? "Edit activity" : "New activity"} footer={<Button loading={isSubmitting} onClick={handleSubmit(submit)}>Save</Button>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(submit)}>
        <div className="sm:col-span-2"><Field label="Title" htmlFor="at" error={errors.title?.message}><Input id="at" {...register("title")} /></Field></div>
        <Field label="Domain" htmlFor="ad" error={errors.domain_id?.message}><Select id="ad" disabled={!!initial} {...register("domain_id")}><option value="">Choose</option>{domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Subdomain" htmlFor="as"><Select id="as" {...register("subdomain_id")}><option value="">-</option>{dom?.subdomains.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
        <Field label="Category" htmlFor="ac"><Select id="ac" {...register("category")}>{Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Submission type" htmlFor="ast"><Select id="ast" {...register("submission_type")}>{["text", "file", "link", "mixed", "none"].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</Select></Field>
        <div className="sm:col-span-2"><Field label="Description" htmlFor="ade" error={errors.description?.message}><Textarea id="ade" {...register("description")} /></Field></div>
        <div className="sm:col-span-2"><Field label="Instructions" htmlFor="ai" error={errors.instructions?.message}><Textarea id="ai" {...register("instructions")} /></Field></div>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <Field label="Difficulty (1-5)" htmlFor="adf" error={errors.difficulty?.message}><Input id="adf" type="number" {...register("difficulty")} /></Field>
          <Field label="Min age" htmlFor="amn" error={errors.min_age?.message}><Input id="amn" type="number" {...register("min_age")} /></Field>
          <Field label="Max age" htmlFor="amx" error={errors.max_age?.message}><Input id="amx" type="number" {...register("max_age")} /></Field>
          <Field label="Minutes" htmlFor="amin"><Input id="amin" type="number" {...register("estimated_minutes")} /></Field>
          <Field label="Max score" htmlFor="ams"><Input id="ams" type="number" {...register("max_score")} /></Field>
          <Field label="XP" htmlFor="axp"><Input id="axp" type="number" {...register("xp_reward")} /></Field>
        </div>
        <Field label="Rubric" htmlFor="ar"><Select id="ar" {...register("rubric_id")}><option value="">No rubric (single score)</option>{rubrics.data?.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</Select></Field>
        <Field label="Status" htmlFor="ass"><Select id="ass" {...register("status")}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></Select></Field>
      </form>
    </Modal>
  );
}

function AssignModal({ a, onClose }: { a: Activity; onClose: () => void }) {
  const me = useAuth((s) => s.me);
  const batches = useQuery({ queryKey: ["batches"], queryFn: () => api.mentors.batches(), enabled: !!me?.mentor_id });
  const students = useQuery({ queryKey: ["mentor-students"], queryFn: () => api.mentors.students() });
  const [batch, setBatch] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const toast = useToast();
  const m = useMutation({
    mutationFn: () => api.activities.assign(a.id, { student_ids: ids, batch_id: batch || null, due_at: due ? new Date(due).toISOString() : null }),
    onSuccess: (r) => { toast.success(`Assigned to ${r.length} student(s)`); onClose(); }, onError: (e) => toast.error(e),
  });
  return (
    <Modal open onClose={onClose} title={`Assign: ${a.title}`} footer={<Button loading={m.isPending} disabled={!batch && !ids.length} onClick={() => m.mutate()}>Assign</Button>}>
      <div className="space-y-4">
        {!!batches.data?.length && <Field label="Batch" htmlFor="ab"><Select id="ab" value={batch} onChange={(e) => setBatch(e.target.value)}><option value="">-</option>{batches.data.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.student_count})</option>)}</Select></Field>}
        <Field label="Or individual students">
          <div className="max-h-56 space-y-1 overflow-y-auto">{students.data?.map((s) => <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ids.includes(s.id)} onChange={() => setIds(ids.includes(s.id) ? ids.filter((x) => x !== s.id) : [...ids, s.id])} />{s.full_name}<span className="text-xs text-subtle">{s.age_group}</span></label>)}</div>
        </Field>
        <Field label="Due date (optional)" htmlFor="adue"><Input id="adue" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

type QDraft = { type: string; prompt: string; options: string; correct: string; points: number };
const ASSESSMENT_TYPES = ["multiple_choice", "logical_reasoning", "scenario", "creative_response", "practical_execution", "project_based", "self_reflection", "mentor_evaluation", "presentation", "research"];

export function AssessmentBuilder() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["manage-assessments", page], queryFn: () => api.assessments.list({ page, page_size: 15 }) });
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState({ title: "", domain_id: "", type: "multiple_choice", difficulty: 2, min_age: 9, max_age: 17, time_limit_minutes: 15, max_attempts: 3 });
  const [qs, setQs] = useState<QDraft[]>([{ type: "mcq", prompt: "", options: "Option A\nOption B", correct: "a", points: 1 }]);
  const qc = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: () => api.assessments.create({
      ...meta, questions: qs.map((x, i) => {
        const options = x.type === "mcq" || x.type === "multi_select" ? x.options.split("\n").filter(Boolean).map((label, k) => ({ key: "abcdefghij"[k], label })) : [];
        const correct = x.type === "mcq" ? x.correct.trim() || null : x.type === "multi_select" ? x.correct.split(",").map((c) => c.trim()).filter(Boolean)
          : x.type === "numeric" ? { value: Number(x.correct), tolerance: 0 } : null;
        return { type: x.type, prompt: x.prompt, options, correct_answer: correct, points: x.points, sort_order: i };
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["manage-assessments"] }); setOpen(false); toast.success("Assessment created"); },
    onError: (e) => toast.error(e),
  });
  const upd = (i: number, patch: Partial<QDraft>) => setQs(qs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <>
      <PageHeader title="Assessments" subtitle="Build question banks with auto-graded and mentor-graded questions." actions={<Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New assessment</Button>} />
      <QueryState q={q}>
        {(d) => (<><Table rows={d.items} rowKey={(r) => r.id} columns={[
          { key: "t", header: "Title", render: (r) => <div><div className="font-medium">{r.title}</div><div className="text-xs text-subtle">{r.domain_name}</div></div> },
          { key: "ty", header: "Type", render: (r) => titleCase(r.type) },
          { key: "q", header: "Questions", render: (r) => r.question_count },
          { key: "l", header: "Limit", render: (r) => (r.time_limit_minutes ? `${r.time_limit_minutes} min` : "-") },
          { key: "at", header: "Attempts", render: (r) => r.max_attempts },
        ]} /><Pagination page={page} pageSize={15} total={d.total} onPage={setPage} /></>)}
      </QueryState>
      <Modal wide open={open} onClose={() => setOpen(false)} title="New assessment"
        footer={<Button loading={create.isPending} disabled={meta.title.length < 3 || !meta.domain_id || qs.some((x) => x.prompt.length < 3)} onClick={() => create.mutate()}>Create</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" htmlFor="xt"><Input id="xt" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
          <Field label="Domain" htmlFor="xd"><Select id="xd" value={meta.domain_id} onChange={(e) => setMeta({ ...meta, domain_id: e.target.value })}><option value="">Choose</option>{domains.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Type" htmlFor="xty"><Select id="xty" value={meta.type} onChange={(e) => setMeta({ ...meta, type: e.target.value })}>{ASSESSMENT_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Level" htmlFor="xl"><Input id="xl" type="number" min={1} max={5} value={meta.difficulty} onChange={(e) => setMeta({ ...meta, difficulty: Number(e.target.value) })} /></Field>
            <Field label="Minutes" htmlFor="xm"><Input id="xm" type="number" value={meta.time_limit_minutes} onChange={(e) => setMeta({ ...meta, time_limit_minutes: Number(e.target.value) })} /></Field>
            <Field label="Attempts" htmlFor="xa"><Input id="xa" type="number" value={meta.max_attempts} onChange={(e) => setMeta({ ...meta, max_attempts: Number(e.target.value) })} /></Field>
          </div>
        </div>
        <h3 className="mb-2 mt-6 font-semibold">Questions</h3>
        <div className="space-y-3">
          {qs.map((x, i) => (
            <Card key={i} className="space-y-2 p-3">
              <div className="flex gap-2">
                <Select aria-label="Question type" className="max-w-40" value={x.type} onChange={(e) => upd(i, { type: e.target.value })}>{["mcq", "multi_select", "numeric", "short_text", "long_text", "rating"].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</Select>
                <Input aria-label="Points" type="number" className="max-w-24" value={x.points} onChange={(e) => upd(i, { points: Number(e.target.value) })} />
                <Button variant="ghost" aria-label="Remove question" onClick={() => setQs(qs.filter((_, k) => k !== i))}><Trash2 className="size-4" /></Button>
              </div>
              <Input aria-label="Prompt" placeholder="Question prompt" value={x.prompt} onChange={(e) => upd(i, { prompt: e.target.value })} />
              {(x.type === "mcq" || x.type === "multi_select") && <Textarea aria-label="Options" className="min-h-16" placeholder="One option per line" value={x.options} onChange={(e) => upd(i, { options: e.target.value })} />}
              {["mcq", "multi_select", "numeric"].includes(x.type) && <Input aria-label="Correct answer" placeholder={x.type === "numeric" ? "Correct number" : x.type === "mcq" ? "Correct option key (a, b, ...)" : "Correct keys, comma separated"} value={x.correct} onChange={(e) => upd(i, { correct: e.target.value })} />}
            </Card>
          ))}
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setQs([...qs, { type: "mcq", prompt: "", options: "Option A\nOption B", correct: "a", points: 1 }])}>Add question</Button>
        </div>
      </Modal>
    </>
  );
}
