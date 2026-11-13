import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Activity } from "@pathfinder/shared-types";
import { categoryLabels } from "@pathfinder/design-system";
import { CheckCircle2, Clock, FileUp, Paperclip, Search, Star, Users } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import {
  Badge, Button, Card, CardBody, CardHeader, cx, EmptyState, Field, Input, PageHeader, Pagination, QueryState, Select, Skeleton, Textarea, useToast,
} from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

const statusTone = { assigned: "warning", in_progress: "info", submitted: "primary", completed: "success" } as const;

export function ActivityCard({ a }: { a: Activity }) {
  return (
    <Link to={`/app/activities/${a.id}`}>
      <Card interactive className="flex h-full flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <Badge><span className="size-2 rounded-full" style={{ background: a.domain_color ?? undefined }} />{a.domain_name}</Badge>
          {a.my_status && <Badge tone={statusTone[a.my_status as keyof typeof statusTone] ?? "neutral"}>{a.my_status.replace("_", " ")}</Badge>}
        </div>
        <h3 className="mt-3 font-semibold leading-snug">{a.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-subtle">{a.description}</p>
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-4 text-xs text-subtle">
          <span>{categoryLabels[a.category]}</span>
          <span className="inline-flex items-center gap-1"><Clock className="size-3" />{a.estimated_minutes}m</span>
          <span className="inline-flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={cx("size-3", i < a.difficulty ? "fill-accent text-accent" : "text-line")} />)}</span>
          {a.is_team && <Users className="size-3" />}
        </div>
      </Card>
    </Link>
  );
}

export function Activities() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const filters = { domain_id: params.get("domain") ?? undefined, category: params.get("category") ?? undefined, difficulty: params.get("difficulty") ?? undefined, q: params.get("q") ?? undefined };
  const q = useQuery({ queryKey: ["activities", filters, page], queryFn: () => api.activities.list({ ...filters, page, page_size: 12 }) });
  const mine = useQuery({ queryKey: ["my-assignments"], queryFn: () => api.activities.mine() });
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p); setPage(1); };
  const assigned = mine.data?.filter((m) => !m.is_voluntary && m.status !== "completed") ?? [];
  return (
    <>
      <PageHeader title="Activities" subtitle="Hands-on activities matched to your age. Pick anything that sparks your curiosity."
        actions={<><Link to="/app/challenges"><Button variant="secondary">Challenges</Button></Link><Link to="/app/projects"><Button variant="secondary">My submissions & project ideas</Button></Link></>} />
      {assigned.length > 0 && (
        <Card className="mb-6"><CardHeader title="Assigned to you" />
          <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{assigned.map((m) => m.activity && <ActivityCard key={m.id} a={{ ...m.activity, my_status: m.status }} />)}</CardBody>
        </Card>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <div className="relative sm:col-span-1"><Search className="absolute left-3 top-3 size-4 text-subtle" /><Input aria-label="Search activities" className="pl-9" placeholder="Search" defaultValue={filters.q} onKeyDown={(e) => e.key === "Enter" && set("q", (e.target as HTMLInputElement).value)} /></div>
        <Select aria-label="Domain" value={filters.domain_id ?? ""} onChange={(e) => set("domain", e.target.value)}><option value="">All domains</option>{domains.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
        <Select aria-label="Category" value={filters.category ?? ""} onChange={(e) => set("category", e.target.value)}><option value="">All categories</option>{Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select aria-label="Difficulty" value={filters.difficulty ?? ""} onChange={(e) => set("difficulty", e.target.value)}><option value="">Any difficulty</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Level {n}</option>)}</Select>
      </div>
      <QueryState q={q} isEmpty={(d) => !d.items.length} empty={<EmptyState title="No activities match" body="Try clearing a filter." />}
        skeleton={<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>}>
        {(d) => (<><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{d.items.map((a) => <ActivityCard key={a.id} a={a} />)}</div><Pagination page={page} pageSize={12} total={d.total} onPage={setPage} /></>)}
      </QueryState>
    </>
  );
}

export function ActivityDetail() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["activity", id], queryFn: () => api.activities.get(id) });
  const subs = useQuery({ queryKey: ["submissions", id], queryFn: () => api.submissions.list({ activity_id: id }) });
  return (
    <QueryState q={q}>
      {(a) => {
        const pending = subs.data?.items.some((s) => s.status === "submitted");
        return (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div>
                <Link to="/app/activities" className="text-sm text-subtle hover:text-ink">← Activity Centre</Link>
                <h1 className="mt-2 text-2xl font-bold sm:text-3xl">{a.title}</h1>
                <div className="mt-2 flex flex-wrap gap-2"><Badge>{a.domain_name}</Badge>{a.subdomain_name && <Badge>{a.subdomain_name}</Badge>}<Badge>{categoryLabels[a.category]}</Badge><Badge tone="warning">Level {a.difficulty}</Badge><Badge tone="primary">+{a.xp_reward} XP</Badge></div>
              </div>
              <Card><CardHeader title="About" /><CardBody><p className="text-sm">{a.description}</p></CardBody></Card>
              <Card><CardHeader title="Instructions" /><CardBody><p className="whitespace-pre-line text-sm">{a.instructions}</p></CardBody></Card>
              {pending ? (
                <Card className="p-5 text-sm"><CheckCircle2 className="mb-2 size-5 text-success" />Your work is submitted and waiting for mentor review. You'll get a notification when it's reviewed.</Card>
              ) : a.submission_type !== "none" && <SubmitForm a={a} />}
            </div>
            <div className="space-y-6">
              <Card><CardHeader title="How it's evaluated" /><CardBody>
                {a.rubric ? <ul className="space-y-2 text-sm">{(a.rubric.criteria as Array<{ key: string; label: string; max_points: number }>).map((c) => <li key={c.key} className="flex justify-between"><span>{c.label}</span><span className="text-subtle">{c.max_points} pts</span></li>)}</ul>
                  : <ul className="list-disc pl-4 text-sm">{a.evaluation_criteria.map((c) => <li key={c}>{c}</li>)}</ul>}
                <p className="mt-3 text-xs text-subtle">Scores show how this piece of work went - not how clever you are. You can try again.</p>
              </CardBody></Card>
              <Card><CardHeader title="Your submissions" />
                <CardBody className="space-y-3">
                  {subs.isLoading && <Skeleton className="h-16" />}
                  {subs.data?.items.length === 0 && <p className="text-sm text-subtle">Nothing yet.</p>}
                  {subs.data?.items.map((s) => (
                    <div key={s.id} className="rounded-xl border border-line p-3 text-sm">
                      <div className="flex justify-between"><span>Attempt {s.attempt_no}</span><Badge tone={s.status === "evaluated" ? "success" : s.status === "returned" ? "warning" : "primary"}>{s.status}</Badge></div>
                      <div className="text-xs text-subtle">{fmtDateTime(s.submitted_at)}</div>
                      {s.evaluations.filter((e) => e.is_current).map((e) => (
                        <div key={e.id} className="mt-2 rounded-lg bg-muted p-2"><strong>{e.normalized_score.toFixed(0)}%</strong>{e.feedback && <p className="mt-1 text-subtle">"{e.feedback}" - {e.evaluator_name}</p>}</div>
                      ))}
                      {s.status === "evaluated" && <AddToPortfolio id={s.id} />}
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

function AddToPortfolio({ id }: { id: string }) {
  const toast = useToast();
  const m = useMutation({ mutationFn: () => api.submissions.toPortfolio(id), onSuccess: (r) => toast.success(r.message), onError: (e) => toast.error(e) });
  return <Button size="sm" variant="ghost" className="mt-2" loading={m.isPending} onClick={() => m.mutate()}>Add to portfolio</Button>;
}

function SubmitForm({ a }: { a: Activity }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [reflection, setReflection] = useState("");
  const [rating, setRating] = useState<number | undefined>();
  const [files, setFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const needsFile = a.submission_type === "file" || a.submission_type === "mixed";
  const needsText = a.submission_type === "text" || a.submission_type === "mixed";
  const needsLink = a.submission_type === "link" || a.submission_type === "mixed";
  const submit = useMutation({
    mutationFn: () => api.submissions.create({ activity_id: a.id, content_text: text || undefined, link_url: link || undefined, file_ids: files.map((f) => f.id), reflection: reflection || undefined, self_rating: rating }),
    onSuccess: () => { toast.success(`Submitted! +XP earned. Your mentor will review it soon.`); qc.invalidateQueries({ queryKey: ["submissions", a.id] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); setText(""); setLink(""); setFiles([]); },
    onError: (e) => toast.error(e),
  });
  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(list)) { const r = await api.files.upload(f, f.name); setFiles((x) => [...x, { id: r.id, name: r.original_name }]); }
    } catch (e) { toast.error(e); } finally { setUploading(false); }
  };
  return (
    <Card>
      <CardHeader title="Submit your work" />
      <CardBody className="space-y-4">
        {needsText && <Field label="Your answer" htmlFor="ans"><Textarea id="ans" value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} /></Field>}
        {needsLink && <Field label="Link to your work" htmlFor="lnk" hint="e.g. Scratch project, Google Drive, video"><Input id="lnk" type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} /></Field>}
        {needsFile && (
          <Field label="Files" hint="Images, PDF, video, slides (max 20 MB)">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line p-4 text-sm text-subtle hover:border-primary">
              <FileUp className="size-5" />{uploading ? "Uploading..." : "Choose files"}
              <input type="file" multiple className="sr-only" onChange={(e) => upload(e.target.files)} accept="image/*,video/mp4,video/webm,application/pdf,text/plain,.pptx,.docx,.zip" />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">{files.map((f) => <Badge key={f.id}><Paperclip className="size-3" />{f.name}</Badge>)}</div>
          </Field>
        )}
        <Field label="Reflection (optional)" htmlFor="ref" hint="What did you learn? What was tricky?"><Textarea id="ref" className="min-h-20" value={reflection} onChange={(e) => setReflection(e.target.value)} /></Field>
        <Field label="How much did you enjoy it?">
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} stars`} onClick={() => setRating(n)}><Star className={cx("size-6", rating && n <= rating ? "fill-accent text-accent" : "text-line")} /></button>)}</div>
        </Field>
        <div className="flex justify-end"><Button loading={submit.isPending} disabled={uploading} onClick={() => submit.mutate()}>Submit</Button></div>
      </CardBody>
    </Card>
  );
}
