import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Attempt } from "@pathfinder/shared-types";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, Card, CardBody, CardHeader, cx, EmptyState, Input, PageHeader, ProgressBar, QueryState, Select, Table, Textarea, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDateTime, titleCase } from "@/lib/format";

export function Assessments() {
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const [domain, setDomain] = useState("");
  const q = useQuery({ queryKey: ["assessments", domain], queryFn: () => api.assessments.list({ domain_id: domain || undefined, page_size: 50 }) });
  const history = useQuery({ queryKey: ["attempts"], queryFn: () => api.assessments.attempts() });
  return (
    <>
      <PageHeader title="Assessment Centre" subtitle="Quizzes, scenarios, creative and reflective checks. Your score is one piece of evidence - never the whole picture." />
      <div className="mb-4 max-w-xs"><Select aria-label="Domain" value={domain} onChange={(e) => setDomain(e.target.value)}><option value="">All domains</option>{domains.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></div>
      <QueryState q={q} isEmpty={(d) => !d.items.length} empty={<EmptyState title="No assessments for your age group here" />}>
        {(d) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {d.items.map((a) => (
              <Card key={a.id} className="flex flex-col p-5">
                <div className="flex justify-between"><Badge>{a.domain_name}</Badge><Badge tone="primary">{titleCase(a.type)}</Badge></div>
                <h3 className="mt-3 font-semibold">{a.title}</h3>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-subtle">
                  <span>{a.question_count} questions</span>{a.time_limit_minutes && <span className="inline-flex items-center gap-1"><Clock className="size-3" />{a.time_limit_minutes} min</span>}
                  <span>Attempts {a.my_attempts ?? 0}/{a.max_attempts}</span>{a.my_best_score != null && <span>Best {a.my_best_score.toFixed(0)}%</span>}
                </div>
                <div className="mt-auto pt-4">
                  <Link to={`/app/assessments/${a.id}/take`}><Button className="w-full" variant={(a.my_attempts ?? 0) >= a.max_attempts ? "secondary" : "primary"} disabled={(a.my_attempts ?? 0) >= a.max_attempts}>{(a.my_attempts ?? 0) >= a.max_attempts ? "No attempts left" : (a.my_attempts ?? 0) > 0 ? "Try again" : "Start"}</Button></Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
      <h2 className="mb-3 mt-10 text-xl font-semibold">Assessment history</h2>
      <QueryState q={history} isEmpty={(h) => !h.length} empty={<EmptyState title="No attempts yet" />}>
        {(h) => (
          <Table rows={h} rowKey={(r) => r.id} columns={[
            { key: "t", header: "Assessment", render: (r) => <Link className="text-primary-ink hover:underline" to={`/app/assessments/attempts/${r.id}`}>{r.assessment_title}</Link> },
            { key: "n", header: "Attempt", render: (r) => `#${r.attempt_no}` },
            { key: "s", header: "Status", render: (r) => <Badge tone={r.status === "evaluated" ? "success" : "warning"}>{titleCase(r.status)}</Badge> },
            { key: "sc", header: "Score", render: (r) => (r.normalized_score != null ? `${r.normalized_score.toFixed(0)}%` : "-") },
            { key: "d", header: "Date", render: (r) => fmtDateTime(r.submitted_at ?? r.started_at) },
          ]} />
        )}
      </QueryState>
    </>
  );
}

function Countdown({ expires }: { expires: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.max(0, new Date(expires).getTime() - now);
  const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
  return <Badge tone={left < 60000 ? "danger" : "warning"}><Clock className="size-3" />{m}:{String(s).padStart(2, "0")}</Badge>;
}

export function TakeAssessment() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const meta = useQuery({ queryKey: ["assessment", id], queryFn: () => api.assessments.get(id) });
  const start = useQuery({ queryKey: ["attempt-start", id], queryFn: () => api.assessments.start(id), retry: false, staleTime: Infinity, gcTime: 0 });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [i, setI] = useState(0);
  const saved = useRef<string>("");
  const attempt = start.data;
  useEffect(() => { if (attempt) setAnswers(Object.fromEntries(attempt.responses.map((r) => [r.question_id, r.answer]))); }, [attempt]);
  const payload = useMemo(() => Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer })), [answers]);
  // Autosave every 15 seconds so progress isn't lost.
  useEffect(() => {
    if (!attempt) return;
    const t = setInterval(() => { const s = JSON.stringify(payload); if (s !== saved.current) { saved.current = s; void api.assessments.save(attempt.id, payload).catch(() => {}); } }, 15000);
    return () => clearInterval(t);
  }, [attempt, payload]);
  const submit = useMutation({
    mutationFn: () => api.assessments.submit(attempt!.id, payload),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["attempts"] }); qc.invalidateQueries({ queryKey: ["assessments"] }); navigate(`/app/assessments/attempts/${r.id}`, { replace: true }); },
    onError: (e) => toast.error(e),
  });
  if (start.error) return <QueryState q={start}>{() => null}</QueryState>;
  return (
    <QueryState q={start}>
      {(att) => {
        const q = att.questions[i];
        if (!q) return <EmptyState title="This assessment has no questions" />;
        const answered = att.questions.filter((x) => answers[x.id] !== undefined && answers[x.id] !== "" && answers[x.id] !== null).length;
        return (
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><h1 className="text-xl font-bold">{meta.data?.title}</h1><p className="text-sm text-subtle">Attempt {att.attempt_no} · {answered}/{att.questions.length} answered</p></div>
              {att.expires_at && <Countdown expires={att.expires_at} />}
            </div>
            <ProgressBar value={i + 1} max={att.questions.length} label="Question progress" />
            <Card className="mt-6 p-6">
              <div className="text-xs text-subtle">Question {i + 1} of {att.questions.length} · {q.points} pt</div>
              <h2 className="mt-2 text-lg font-semibold">{q.prompt}</h2>
              <div className="mt-5"><AnswerInput q={q} value={answers[q.id]} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} /></div>
            </Card>
            <div className="mt-4 flex items-center justify-between">
              <Button variant="secondary" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</Button>
              <div className="hidden gap-1 sm:flex">{att.questions.map((x, k) => <button key={x.id} aria-label={`Question ${k + 1}`} onClick={() => setI(k)} className={cx("size-7 rounded-lg text-xs", k === i ? "bg-primary text-on-primary" : answers[x.id] !== undefined ? "bg-primary-soft text-primary-ink" : "bg-muted")}>{k + 1}</button>)}</div>
              {i < att.questions.length - 1 ? <Button onClick={() => setI(i + 1)}>Next</Button> : <Button loading={submit.isPending} onClick={() => submit.mutate()}>Submit</Button>}
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

function AnswerInput({ q, value, onChange }: { q: Attempt["questions"][number]; value: unknown; onChange: (v: unknown) => void }) {
  const opts = q.options as Array<{ key: string; label: string }>;
  if (q.type === "mcq") return (
    <div className="grid gap-2" role="radiogroup">
      {opts.map((o) => <button key={o.key} role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)} className={cx("rounded-xl border p-3 text-left text-sm", value === o.key ? "border-primary bg-primary-soft" : "border-line hover:bg-muted")}><strong className="mr-2 uppercase">{o.key}.</strong>{o.label}</button>)}
    </div>
  );
  if (q.type === "multi_select") {
    const v = (value as string[] | undefined) ?? [];
    return <div className="grid gap-2">{opts.map((o) => <label key={o.key} className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm"><input type="checkbox" checked={v.includes(o.key)} onChange={() => onChange(v.includes(o.key) ? v.filter((x) => x !== o.key) : [...v, o.key])} />{o.label}</label>)}</div>;
  }
  if (q.type === "numeric") return <Input type="number" aria-label="Your answer" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
  if (q.type === "rating") return <div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => onChange(n)} className={cx("size-11 rounded-xl border", value === n ? "border-primary bg-primary text-on-primary" : "border-line")}>{n}</button>)}</div>;
  if (q.type === "short_text") return <Input aria-label="Your answer" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  return <Textarea aria-label="Your answer" className="min-h-40" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

export function AttemptResult() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["attempt", id], queryFn: () => api.assessments.attempt(id) });
  return (
    <QueryState q={q}>
      {(a) => {
        const review = Object.fromEntries(a.review.map((r) => [r.question_id as string, r]));
        const resp = Object.fromEntries(a.responses.map((r) => [r.question_id, r]));
        return (
          <div className="mx-auto max-w-3xl space-y-6">
            <Link to="/app/assessments" className="text-sm text-subtle hover:text-ink">← Assessment Centre</Link>
            <Card className="p-6 text-center">
              <h1 className="text-2xl font-bold">{a.assessment_title}</h1>
              {a.status === "evaluated" && a.normalized_score != null ? (
                <><div className="mt-4 text-5xl font-extrabold text-primary-ink">{a.normalized_score.toFixed(0)}%</div><p className="mt-1 text-sm text-subtle">{a.raw_score} / {a.max_score} points · attempt {a.attempt_no}</p></>
              ) : a.status === "pending_review" ? <p className="mt-4 text-subtle">Some answers need a mentor's review. You'll be notified when your score is ready.</p>
                : <p className="mt-4 text-subtle">Thanks for reflecting! Reflections help your mentor understand you better.</p>}
              <p className="mt-3 text-xs text-subtle">This shows how this attempt went. It is not a measure of intelligence - practice and retries are encouraged.</p>
            </Card>
            <Card><CardHeader title="Review" /><CardBody className="space-y-4">
              {a.questions.map((qq, k) => {
                const r = resp[qq.id];
                return (
                  <div key={qq.id} className="rounded-xl border border-line p-4">
                    <div className="flex items-start gap-2">{r?.is_correct === true ? <CheckCircle2 className="size-5 text-success" /> : r?.is_correct === false ? <XCircle className="size-5 text-danger" /> : null}<div className="text-sm font-medium">{k + 1}. {qq.prompt}</div></div>
                    <div className="mt-2 text-sm text-subtle">Your answer: {r?.answer == null ? <em>no answer</em> : String(Array.isArray(r.answer) ? r.answer.join(", ") : r.answer)}</div>
                    {review[qq.id]?.correct_answer != null && <div className="text-sm">Correct: {JSON.stringify(review[qq.id]!.correct_answer).replace(/"/g, "")}</div>}
                    {review[qq.id]?.explanation ? <div className="mt-1 text-sm text-subtle">{review[qq.id]!.explanation as string}</div> : null}
                    {r?.feedback && <div className="mt-1 text-sm text-primary-ink">Mentor: {r.feedback}</div>}
                  </div>
                );
              })}
            </CardBody></Card>
          </div>
        );
      }}
    </QueryState>
  );
}
