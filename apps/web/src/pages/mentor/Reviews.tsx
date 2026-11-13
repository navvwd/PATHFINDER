import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Paperclip } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, QueryState, Tabs, Textarea, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDateTime, relTime } from "@/lib/format";

export function ReviewQueue() {
  const q = useQuery({ queryKey: ["review-queue"], queryFn: () => api.mentors.reviewQueue() });
  const [tab, setTab] = useState<"subs" | "attempts">("subs");
  return (
    <>
      <PageHeader title="Review queue" subtitle="Evaluate submissions with rubrics and grade open-ended answers." />
      <QueryState q={q}>
        {(d) => (<>
          <Tabs value={tab} onChange={setTab} tabs={[{ key: "subs", label: `Submissions (${d.submissions.length})` }, { key: "attempts", label: `Assessments (${d.attempts.length})` }]} />
          <div className="mt-4">
            {tab === "subs" ? (d.submissions.length ? <Card className="divide-y divide-line">{d.submissions.map((s) => (
              <Link key={s.id} to={`/mentor/reviews/${s.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted"><div><div className="text-sm font-medium">{s.activity_title}</div><div className="text-xs text-subtle">{s.student_name} · attempt {s.attempt_no}</div></div><span className="text-xs text-subtle">{relTime(s.submitted_at)}</span></Link>))}</Card>
              : <EmptyState title="No submissions waiting" />)
              : d.attempts.length ? <Card className="divide-y divide-line">{d.attempts.map((a) => (
                <Link key={a.id} to={`/mentor/attempts/${a.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted"><div><div className="text-sm font-medium">{a.assessment_title}</div><div className="text-xs text-subtle">{a.student_name}</div></div><span className="text-xs text-subtle">{a.submitted_at ? relTime(a.submitted_at) : ""}</span></Link>))}</Card>
                : <EmptyState title="No assessments waiting" />}
          </div>
        </>)}
      </QueryState>
    </>
  );
}

export function ReviewSubmission() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["submission", id], queryFn: () => api.submissions.get(id) });
  const activity = useQuery({ queryKey: ["activity", q.data?.activity_id], enabled: !!q.data, queryFn: () => api.activities.get(q.data!.activity_id) });
  const [scores, setScores] = useState<Record<string, number>>({});
  const [total, setTotal] = useState<number | "">("");
  const [feedback, setFeedback] = useState("");
  const [quality, setQuality] = useState(0.6);
  const [validated, setValidated] = useState(true);
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const ev = useMutation({
    mutationFn: (ret: boolean) => api.submissions.evaluate(id, activity.data?.rubric ? { criteria_scores: scores, feedback, evidence_quality: quality, mentor_validated: validated, return_for_revision: ret }
      : { total_score: Number(total), feedback, evidence_quality: quality, mentor_validated: validated, return_for_revision: ret }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-queue"] }); toast.success("Evaluation saved - student and guardians notified"); navigate("/mentor/reviews"); },
    onError: (e) => toast.error(e),
  });
  const open = async (fid: string) => window.open(URL.createObjectURL(await api.files.download(fid)), "_blank", "noopener");
  return (
    <QueryState q={q}>
      {(s) => {
        const criteria = (activity.data?.rubric?.criteria ?? []) as Array<{ key: string; label: string; max_points: number; dimension: string; description?: string }>;
        return (
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="space-y-4">
              <Link to="/mentor/reviews" className="text-sm text-subtle hover:text-ink">← Queue</Link>
              <PageHeader title={s.activity_title} subtitle={`${s.student_name} · attempt ${s.attempt_no} · ${fmtDateTime(s.submitted_at)}`} />
              <Card><CardHeader title="Submission" /><CardBody className="space-y-3 text-sm">
                {s.content_text && <p className="whitespace-pre-line rounded-xl bg-muted p-3">{s.content_text}</p>}
                {s.link_url && <a href={s.link_url} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline">{s.link_url}</a>}
                {s.files.map((f) => <button key={f.id} onClick={() => open(f.id)} className="flex items-center gap-2 text-primary"><Paperclip className="size-4" />{f.original_name}</button>)}
                {s.reflection && <div><div className="text-xs font-semibold text-subtle">Student reflection</div><p>{s.reflection}</p></div>}
                {s.self_rating && <div className="text-xs text-subtle">Enjoyment: {s.self_rating}/5</div>}
              </CardBody></Card>
              {s.evaluations.length > 0 && <Card><CardHeader title="Previous evaluations (kept as history)" /><CardBody className="space-y-2 text-sm">{s.evaluations.map((e) => <div key={e.id} className="flex justify-between"><span>{e.normalized_score.toFixed(0)}% by {e.evaluator_name}</span><span className="text-xs text-subtle">{e.is_current ? "current" : "superseded"} · {fmtDateTime(e.created_at)}</span></div>)}</CardBody></Card>}
            </div>
            <Card className="h-fit lg:sticky lg:top-20"><CardHeader title="Evaluate" subtitle={activity.data?.rubric?.title ?? `Score out of ${activity.data?.max_score ?? 100}`} />
              <CardBody className="space-y-4">
                {criteria.length ? criteria.map((c) => (
                  <Field key={c.key} label={`${c.label} (0-${c.max_points})`} hint={`Feeds: ${c.dimension.replace("_", " ")}`}>
                    <input type="range" min={0} max={c.max_points} step={0.5} value={scores[c.key] ?? 0} onChange={(e) => setScores({ ...scores, [c.key]: Number(e.target.value) })} className="w-full accent-[var(--pf-primary)]" aria-label={c.label} />
                    <div className="text-right text-sm font-medium">{scores[c.key] ?? 0}</div>
                  </Field>
                )) : <Field label="Score" htmlFor="ts"><Input id="ts" type="number" min={0} max={activity.data?.max_score} value={total} onChange={(e) => setTotal(e.target.value === "" ? "" : Number(e.target.value))} /></Field>}
                <Field label={`Evidence quality: ${Math.round(quality * 100)}%`} hint="How rich and authentic is the practical evidence?"><input type="range" min={0} max={1} step={0.1} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-[var(--pf-primary)]" aria-label="Evidence quality" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={validated} onChange={(e) => setValidated(e.target.checked)} /> I validate this as genuine practical work</label>
                <Field label="Feedback for the student" htmlFor="fb"><Textarea id="fb" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What went well, and one thing to try next time" /></Field>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="secondary" loading={ev.isPending && ev.variables === true} onClick={() => ev.mutate(true)}>Return for revision</Button>
                  <Button loading={ev.isPending && ev.variables === false} disabled={!criteria.length && total === ""} onClick={() => ev.mutate(false)}>Submit evaluation</Button>
                </div>
              </CardBody></Card>
          </div>
        );
      }}
    </QueryState>
  );
}

export function ReviewAttempt() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["attempt", id], queryFn: () => api.assessments.attempt(id) });
  const [points, setPoints] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState("");
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: (p: Record<string, number>) => api.assessments.evaluate(id, { response_points: p, feedback }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["review-queue"] }); toast.success("Graded"); navigate("/mentor/reviews"); }, onError: (e) => toast.error(e) });
  return (
    <QueryState q={q}>
      {(a) => {
        const resp = Object.fromEntries(a.responses.map((r) => [r.question_id, r]));
        return (
          <div className="mx-auto max-w-3xl space-y-4">
            <PageHeader title={a.assessment_title} subtitle={`Attempt ${a.attempt_no}`} />
            {a.questions.map((qq) => {
              const r = resp[qq.id];
              const auto = r?.is_correct !== null && r?.is_correct !== undefined && points[qq.id] === undefined;
              return (
                <Card key={qq.id} className="p-4 text-sm">
                  <div className="font-medium">{qq.prompt}</div>
                  <div className="mt-2 whitespace-pre-line rounded-lg bg-muted p-2">{r?.answer == null ? <em>no answer</em> : String(r.answer)}</div>
                  <div className="mt-2 flex items-center gap-2">Points (max {qq.points}):
                    <Input type="number" className="w-24" min={0} max={qq.points} step={0.5} aria-label="Points" value={points[qq.id] ?? r?.points_awarded ?? ""} onChange={(e) => setPoints({ ...points, [qq.id]: Number(e.target.value) })} />
                    {auto && <Badge tone={r?.is_correct ? "success" : "danger"}>auto-graded</Badge>}
                  </div>
                </Card>
              );
            })}
            <Field label="Overall feedback" htmlFor="af"><Textarea id="af" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></Field>
            <div className="flex justify-end"><Button loading={m.isPending} onClick={() => {
              const filled = { ...Object.fromEntries(a.responses.filter((r) => r.points_awarded != null).map((r) => [r.question_id, r.points_awarded as number])), ...points };
              m.mutate(filled);
            }}>Save grades</Button></div>
          </div>
        );
      }}
    </QueryState>
  );
}
