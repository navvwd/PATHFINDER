import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Roadmap } from "@pathfinder/shared-types";
import { BookOpen, CheckCircle2, Circle, Flag, Hammer, Plus, SkipForward, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Badge, Button, Card, CardBody, cx, EmptyState, Field, Input, Modal, PageHeader, ProgressBar, QueryState, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

const HORIZONS = [[7, "7-day starter plan"], [30, "30-day learning plan"], [90, "90-day development plan"], [180, "180-day exploration journey"]] as const;

export function Roadmaps() {
  const q = useQuery({ queryKey: ["roadmaps"], queryFn: () => api.roadmaps.list() });
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const interests = useQuery({ queryKey: ["interests"], queryFn: () => api.interests.list() });
  const [open, setOpen] = useState(false);
  const [h, setH] = useState<7 | 30 | 90 | 180>(30);
  const [picked, setPicked] = useState<string[]>([]);
  const navigate = useNavigate();
  const toast = useToast();
  const gen = useMutation({ mutationFn: () => api.roadmaps.generate(h, picked), onSuccess: (r) => navigate(`/app/roadmap/${r.id}`), onError: (e) => toast.error(e) });
  const mine = interests.data?.filter((i) => !i.subdomain_id).map((i) => i.domain_id) ?? [];
  return (
    <>
      <PageHeader title="Development roadmap" subtitle="Personal plans built from real activities. Customise them however you like." actions={<Button icon={<Plus className="size-4" />} onClick={() => { setPicked(mine); setOpen(true); }}>New roadmap</Button>} />
      <QueryState q={q} isEmpty={(d) => !d.length} empty={<EmptyState title="No roadmaps yet" body="Create a 7-day starter plan to begin." action={<Button onClick={() => { setPicked(mine); setOpen(true); }}>Create roadmap</Button>} />}>
        {(list) => (
          <div className="grid gap-4 md:grid-cols-2">
            {list.map((r) => (
              <Link key={r.id} to={`/app/roadmap/${r.id}`}><Card interactive className="p-5">
                <div className="flex justify-between"><Badge tone="primary">{r.horizon_days} days</Badge><Badge tone={r.status === "completed" ? "success" : "neutral"}>{r.status}</Badge></div>
                <h3 className="mt-3 font-semibold">{r.title}</h3><p className="text-xs text-subtle">Started {fmtDate(r.start_date)}</p>
                <div className="mt-3 flex items-center gap-3"><ProgressBar value={r.progress_percent} /><span className="text-sm">{r.progress_percent}%</span></div>
              </Card></Link>
            ))}
          </div>
        )}
      </QueryState>
      <Modal open={open} onClose={() => setOpen(false)} title="Create a roadmap" footer={<Button loading={gen.isPending} disabled={!picked.length} onClick={() => gen.mutate()}>Generate</Button>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">{HORIZONS.map(([d, l]) => <button key={d} onClick={() => setH(d)} className={cx("rounded-xl border p-3 text-left text-sm", h === d ? "border-primary bg-primary-soft" : "border-line")}><strong>{d} days</strong><div className="text-xs text-subtle">{l}</div></button>)}</div>
          <Field label="Domains">
            <div className="flex flex-wrap gap-2">{domains.data?.map((d) => <button key={d.id} onClick={() => setPicked(picked.includes(d.id) ? picked.filter((x) => x !== d.id) : [...picked, d.id])} className={cx("rounded-full border px-3 py-1 text-sm", picked.includes(d.id) ? "border-primary bg-primary text-on-primary" : "border-line")}>{d.name}</button>)}</div>
          </Field>
        </div>
      </Modal>
    </>
  );
}

const kindIcon: Record<string, React.ReactNode> = { activity: <Zap className="size-4" />, resource: <BookOpen className="size-4" />, project: <Hammer className="size-4" />, milestone: <Flag className="size-4" />, custom: <Circle className="size-4" /> };

export function RoadmapView({ r, editable }: { r: Roadmap; editable: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const upd = useMutation({ mutationFn: (v: { id: string; status: string }) => api.roadmaps.updateMilestone(v.id, { status: v.status }), onSuccess: (d) => qc.setQueryData(["roadmap", r.id], d), onError: (e) => toast.error(e) });
  const del = useMutation({ mutationFn: (id: string) => api.roadmaps.deleteMilestone(id), onSuccess: (d) => qc.setQueryData(["roadmap", r.id], d) });
  return (
    <ol className="relative space-y-3 border-l-2 border-line pl-6">
      {r.milestones.map((m) => (
        <li key={m.id} className="relative">
          <span className={cx("absolute -left-[33px] top-3 flex size-5 items-center justify-center rounded-full", m.status === "done" ? "bg-success text-white" : "bg-surface border-2 border-line")}>{m.status === "done" && <CheckCircle2 className="size-4" />}</span>
          <Card className={cx("p-4", m.status !== "pending" && "opacity-70")}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-2"><span className="mt-0.5 text-primary">{kindIcon[m.kind]}</span>
                <div><div className={cx("font-medium", m.status === "done" && "line-through")}>{m.title}</div>{m.description && <div className="text-sm text-subtle">{m.description}</div>}
                  <div className="mt-1 flex gap-2 text-xs text-subtle">Day {m.due_day} · {fmtDate(m.due_date)}{m.is_custom && <Badge>custom</Badge>}</div></div></div>
              {editable && (
                <div className="flex gap-1">
                  {m.activity_id && m.status === "pending" && <Link to={`/app/activities/${m.activity_id}`}><Button size="sm" variant="soft">Open</Button></Link>}
                  {m.resource_url && <a href={m.resource_url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="soft">Open</Button></a>}
                  {m.status === "pending" ? <>
                    <Button size="sm" onClick={() => upd.mutate({ id: m.id, status: "done" })}>Done</Button>
                    <Button size="sm" variant="ghost" aria-label="Skip" onClick={() => upd.mutate({ id: m.id, status: "skipped" })}><SkipForward className="size-4" /></Button>
                  </> : <Button size="sm" variant="ghost" onClick={() => upd.mutate({ id: m.id, status: "pending" })}>Undo</Button>}
                  {m.is_custom && <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => del.mutate(m.id)}><Trash2 className="size-4" /></Button>}
                </div>
              )}
            </div>
          </Card>
        </li>
      ))}
    </ol>
  );
}

export function RoadmapDetail() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["roadmap", id], queryFn: () => api.roadmaps.get(id) });
  const qc = useQueryClient();
  const toast = useToast();
  const [add, setAdd] = useState(false);
  const [m, setM] = useState({ title: "", due_day: 7 });
  const addM = useMutation({ mutationFn: () => api.roadmaps.addMilestone(id, m), onSuccess: (d) => { qc.setQueryData(["roadmap", id], d); setAdd(false); setM({ title: "", due_day: 7 }); }, onError: (e) => toast.error(e) });
  return (
    <QueryState q={q}>
      {(r) => (
        <div className="mx-auto max-w-3xl">
          <Link to="/app/roadmap" className="text-sm text-subtle hover:text-ink">← Roadmaps</Link>
          <PageHeader title={r.title} subtitle={`${r.horizon_days}-day plan started ${fmtDate(r.start_date)}`} actions={<Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setAdd(true)}>Add my own step</Button>} />
          <Card className="mb-6"><CardBody>
            <div className="flex items-center gap-3"><ProgressBar value={r.progress_percent} /><span className="text-sm font-medium">{r.progress_percent}%</span></div>
            <h3 className="mt-4 text-sm font-semibold">Objectives</h3><ul className="mt-1 list-disc pl-5 text-sm">{r.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
            <div className="mt-3 text-xs text-subtle">Mentor review: <Badge tone={r.mentor_review_status === "approved" ? "success" : "neutral"}>{r.mentor_review_status}</Badge>{r.mentor_note && ` "${r.mentor_note}"`}</div>
          </CardBody></Card>
          <RoadmapView r={r} editable />
          <Modal open={add} onClose={() => setAdd(false)} title="Add a custom step" footer={<Button loading={addM.isPending} disabled={m.title.length < 2} onClick={() => addM.mutate()}>Add</Button>}>
            <div className="space-y-3">
              <Field label="What will you do?" htmlFor="mt"><Input id="mt" value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} /></Field>
              <Field label="Day" htmlFor="md"><Input id="md" type="number" min={1} max={r.horizon_days} value={m.due_day} onChange={(e) => setM({ ...m, due_day: Number(e.target.value) })} /></Field>
            </div>
          </Modal>
        </div>
      )}
    </QueryState>
  );
}
