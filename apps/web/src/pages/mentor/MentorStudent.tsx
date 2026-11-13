import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { feedbackSchema, type FeedbackInput } from "@pathfinder/validation";
import { Brain } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router";
import { ProgressPanel } from "../student/Progress";
import { RoadmapView } from "../student/Roadmap";
import { AiLabel, Avatar, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, QueryState, Select, Tabs, Textarea, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDate, titleCase } from "@/lib/format";

type Tab = "progress" | "feedback" | "recommendations" | "roadmaps" | "profile";

export function MentorStudent() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["student", id], queryFn: () => api.students.get(id) });
  const [tab, setTab] = useState<Tab>("progress");
  return (
    <QueryState q={q}>
      {(s) => (
        <>
          <Link to="/mentor/students" className="text-sm text-subtle hover:text-ink">← Students</Link>
          <div className="my-4 flex items-center gap-4"><Avatar name={s.full_name} size={56} /><div><h1 className="text-2xl font-bold">{s.full_name}</h1><p className="text-sm text-subtle">{s.age_group?.label} · Grade {s.grade ?? "-"} · {s.school_name}</p></div></div>
          <Tabs value={tab} onChange={setTab} tabs={[{ key: "progress", label: "Domain performance" }, { key: "feedback", label: "Feedback & insights" }, { key: "recommendations", label: "Recommendation review" }, { key: "roadmaps", label: "Development plans" }, { key: "profile", label: "Profile" }]} />
          <div className="mt-6">
            {tab === "progress" && <ProgressPanel studentId={id} />}
            {tab === "feedback" && <FeedbackTab id={id} />}
            {tab === "recommendations" && <RecReview id={id} />}
            {tab === "roadmaps" && <Plans id={id} />}
            {tab === "profile" && (
              <Card><CardBody className="grid gap-4 text-sm sm:grid-cols-2">
                {([["Hobbies", s.hobbies], ["Favourite subjects", s.favourite_subjects], ["Self-reported strengths", s.self_reported_strengths], ["Skills to learn", s.skills_to_learn], ["Learning preferences", s.learning_preferences], ["Extracurriculars", s.extracurriculars]] as const).map(([l, v]) => (
                  <div key={l}><div className="text-subtle">{l}</div><div className="mt-1 flex flex-wrap gap-1">{v.length ? v.map((x) => <Badge key={x}>{x}</Badge>) : "-"}</div></div>))}
                <div className="sm:col-span-2"><div className="text-subtle">Aspirations</div><p>{s.aspirations ?? "-"}</p></div>
              </CardBody></Card>
            )}
          </div>
        </>
      )}
    </QueryState>
  );
}

function FeedbackTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["feedback", id], queryFn: () => api.mentors.feedback(id) });
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const qc = useQueryClient();
  const toast = useToast();
  const [domain, setDomain] = useState("");
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FeedbackInput>({ resolver: zodResolver(feedbackSchema), defaultValues: { kind: "feedback", visible_to_guardian: true, content: "" } });
  const insights = useMutation({ mutationFn: () => api.ai.mentorInsights(id), onError: (e) => toast.error(e) });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader title="Add feedback or observation" subtitle="Contextual notes help recommendations stay human" />
        <CardBody>
          <form className="space-y-3" onSubmit={handleSubmit(async (v) => { try { await api.mentors.addFeedback(id, { ...v, domain_id: domain || undefined }); reset(); qc.invalidateQueries({ queryKey: ["feedback", id] }); toast.success("Saved and shared"); } catch (e) { toast.error(e); } })}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type" htmlFor="fk"><Select id="fk" {...register("kind")}><option value="feedback">Feedback</option><option value="observation">Observation</option></Select></Field>
              <Field label="Domain" htmlFor="fd"><Select id="fd" value={domain} onChange={(e) => setDomain(e.target.value)}><option value="">General</option>{domains.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            </div>
            <Field label="Note" htmlFor="fc" error={errors.content?.message}><Textarea id="fc" {...register("content")} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register("visible_to_guardian")} /> Visible to guardians</label>
            <div className="flex justify-end"><Button type="submit" loading={isSubmitting}>Save</Button></div>
          </form>
        </CardBody></Card>
      <Card><CardHeader title="Mentor insights" subtitle="Evidence-cited summary - review before acting" action={<Button size="sm" variant="soft" icon={<Brain className="size-4" />} loading={insights.isPending} onClick={() => insights.mutate()}>Generate</Button>} />
        {insights.data && <CardBody className="space-y-3 text-sm"><AiLabel {...insights.data} />
          {(["observations", "suggested_focus", "questions_to_ask", "data_gaps"] as const).map((k) => <div key={k}><h4 className="font-semibold">{titleCase(k)}</h4><ul className="list-disc pl-5">{insights.data.data[k].map((x) => <li key={x}>{x}</li>)}</ul></div>)}
        </CardBody>}
      </Card>
      <Card className="lg:col-span-2"><CardHeader title="History" /><CardBody>
        <QueryState q={q} isEmpty={(d) => !d.length} empty={<p className="text-sm text-subtle">No feedback yet.</p>}>
          {(d) => <ul className="space-y-3">{d.map((f) => <li key={f.id} className="rounded-xl bg-muted p-3 text-sm"><div className="flex justify-between text-xs text-subtle"><span><Badge>{f.kind}</Badge> {f.mentor_name}</span>{fmtDate(f.created_at)}</div><p className="mt-1">{f.content}</p></li>)}</ul>}
        </QueryState>
      </CardBody></Card>
    </div>
  );
}

function RecReview({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["recommendations", id], queryFn: () => api.recommendations.get(id) });
  const qc = useQueryClient();
  const toast = useToast();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const regen = useMutation({ mutationFn: () => api.recommendations.generate(id), onSuccess: (d) => qc.setQueryData(["recommendations", id], d) });
  const review = useMutation({ mutationFn: (v: { rid: string; status: "approved" | "adjusted" | "rejected" }) => api.recommendations.review(v.rid, v.status, notes[v.rid]), onSuccess: () => { qc.invalidateQueries({ queryKey: ["recommendations", id] }); toast.success("Review saved"); }, onError: (e) => toast.error(e) });
  return (
    <QueryState q={q}>
      {(r) => (
        <>
          <div className="mb-4 flex items-center justify-between"><p className="text-sm text-subtle">{r.message}</p><Button size="sm" variant="secondary" loading={regen.isPending} onClick={() => regen.mutate()}>Re-run engine</Button></div>
          {!r.items.length && <EmptyState title="No recommendations generated yet" />}
          <div className="grid gap-4 md:grid-cols-2">
            {r.items.filter((i) => ["focus_domain", "promising_domain", "validation", "alignment"].includes(i.kind)).map((i) => (
              <Card key={i.id}><CardHeader title={i.title} subtitle={titleCase(i.kind)} action={<Badge tone={i.mentor_review_status === "approved" ? "success" : i.mentor_review_status === "pending" ? "neutral" : "warning"}>{i.mentor_review_status}</Badge>} />
                <CardBody className="space-y-2 text-sm">
                  <ul className="list-disc pl-5 text-subtle">{i.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                  {i.status === "disagreed" && <div className="rounded-lg bg-warning-soft p-2">Student disagreed{i.student_response ? `: "${i.student_response}"` : ""}</div>}
                  <Textarea aria-label="Mentor note" className="min-h-16" placeholder="Note to student (optional)" value={notes[i.id] ?? i.mentor_note ?? ""} onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })} />
                  <div className="flex gap-2">{(["approved", "adjusted", "rejected"] as const).map((s) => <Button key={s} size="sm" variant={s === "approved" ? "primary" : "secondary"} onClick={() => review.mutate({ rid: i.id, status: s })}>{titleCase(s)}</Button>)}</div>
                </CardBody></Card>
            ))}
          </div>
        </>
      )}
    </QueryState>
  );
}

function Plans({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["roadmaps", id], queryFn: () => api.roadmaps.list(id) });
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState("");
  const gen = useMutation({ mutationFn: (h: 7 | 30 | 90 | 180) => api.roadmaps.generate(h, [], id), onSuccess: () => qc.invalidateQueries({ queryKey: ["roadmaps", id] }), onError: (e) => toast.error(e) });
  const review = useMutation({ mutationFn: (v: { rid: string; s: string }) => api.roadmaps.review(v.rid, v.s, note || undefined), onSuccess: () => { qc.invalidateQueries({ queryKey: ["roadmaps", id] }); toast.success("Roadmap reviewed"); } });
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">{([7, 30, 90] as const).map((h) => <Button key={h} size="sm" variant="secondary" loading={gen.isPending && gen.variables === h} onClick={() => gen.mutate(h)}>Create {h}-day plan</Button>)}</div>
      <QueryState q={q} isEmpty={(d) => !d.length} empty={<EmptyState title="No development plans yet" />}>
        {(list) => <div className="space-y-6">{list.map((r) => (
          <Card key={r.id}><CardHeader title={r.title} subtitle={`${r.progress_percent}% complete · ${r.status}`} action={<Badge>{r.mentor_review_status}</Badge>} />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2"><Textarea aria-label="Review note" className="min-h-12 flex-1" placeholder="Review note" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button size="sm" onClick={() => review.mutate({ rid: r.id, s: "approved" })}>Approve</Button><Button size="sm" variant="secondary" onClick={() => review.mutate({ rid: r.id, s: "adjusted" })}>Needs changes</Button></div>
              <RoadmapView r={r} editable={false} />
            </CardBody></Card>))}</div>}
      </QueryState>
    </>
  );
}

