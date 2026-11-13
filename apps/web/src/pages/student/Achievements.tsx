import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Flame, Lock, Plus, Star } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, cx, Field, Input, Modal, PageHeader, ProgressBar, QueryState, Select, Stat, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDate, relTime } from "@/lib/format";

export function Achievements() {
  const q = useQuery({ queryKey: ["achievements"], queryFn: () => api.achievements.get() });
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [g, setG] = useState({ title: "", kind: "custom", target_count: 3 });
  const add = useMutation({ mutationFn: () => api.progress.addGoal(g), onSuccess: () => { qc.invalidateQueries({ queryKey: ["achievements"] }); setOpen(false); }, onError: (e) => toast.error(e) });
  const bump = useMutation({ mutationFn: (id: string) => api.progress.updateGoal(id, { increment: 1 }), onSuccess: () => qc.invalidateQueries({ queryKey: ["achievements"] }) });
  return (
    <QueryState q={q}>
      {(d) => (
        <>
          <PageHeader title="Achievements" subtitle="Celebrate your own progress. There are no leaderboards here - just you, growing." />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Level" value={d.level} icon={<Star className="size-4 text-accent" />} hint={<ProgressBar value={d.xp_into_level} max={d.xp_for_next_level} label="Level progress" />} />
            <Stat label="Total XP" value={d.xp} />
            <Stat label="Current streak" value={`${d.current_streak} day${d.current_streak === 1 ? "" : "s"}`} icon={<Flame className="size-4 text-danger" />} />
            <Stat label="Badges" value={`${d.achievements.filter((a) => a.earned).length}/${d.achievements.length}`} icon={<Award className="size-4 text-primary-ink" />} />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2"><CardHeader title="Badges" /><CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {d.achievements.map((a) => (
                <div key={a.id} className={cx("rounded-2xl border p-4", a.earned ? "border-primary/40 bg-primary-soft/50" : "border-line opacity-60")}>
                  <div className="flex items-center gap-2">{a.earned ? <Award className="size-5 text-accent" /> : <Lock className="size-5 text-subtle" />}<span className="font-semibold">{a.title}</span></div>
                  <p className="mt-1 text-xs text-subtle">{a.description}</p>
                  <div className="mt-2 flex justify-between text-xs"><Badge>+{a.xp_reward} XP</Badge>{a.awarded_at && <span className="text-subtle">{fmtDate(a.awarded_at)}</span>}</div>
                </div>
              ))}
            </CardBody></Card>
            <div className="space-y-6">
              <Card><CardHeader title="This week's goals" action={<Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Goal</Button>} />
                <CardBody className="space-y-4">{d.weekly_goals.map((g) => (
                  <div key={g.id}><div className="mb-1 flex justify-between text-sm"><span>{g.title}</span><span className="text-subtle">{g.current_count}/{g.target_count}</span></div>
                    <ProgressBar value={g.current_count} max={g.target_count} color={g.status === "completed" ? "var(--pf-success)" : undefined} />
                    {g.kind === "custom" && g.status === "active" && <Button size="sm" variant="ghost" className="mt-1" onClick={() => bump.mutate(g.id)}>+1 progress</Button>}
                  </div>))}</CardBody></Card>
              <Card><CardHeader title="Recent XP" /><CardBody className="space-y-2">{d.recent_xp.map((x, i) => <div key={i} className="flex justify-between text-sm"><span className="truncate">{x.reason as string}</span><span className="text-success">+{x.amount as number} <span className="text-xs text-subtle">{relTime(x.at as string)}</span></span></div>)}</CardBody></Card>
            </div>
          </div>
          <Modal open={open} onClose={() => setOpen(false)} title="Add a weekly goal" footer={<Button loading={add.isPending} disabled={g.title.length < 2} onClick={() => add.mutate()}>Add</Button>}>
            <div className="space-y-3">
              <Field label="Goal" htmlFor="gt"><Input id="gt" value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} placeholder="e.g. Practise drawing 3 times" /></Field>
              <Field label="Tracks" htmlFor="gk"><Select id="gk" value={g.kind} onChange={(e) => setG({ ...g, kind: e.target.value })}><option value="custom">I'll track it myself</option><option value="activities">Activities submitted</option><option value="assessments">Assessments completed</option></Select></Field>
              <Field label="Target" htmlFor="gn"><Input id="gn" type="number" min={1} max={50} value={g.target_count} onChange={(e) => setG({ ...g, target_count: Number(e.target.value) })} /></Field>
            </div>
          </Modal>
        </>
      )}
    </QueryState>
  );
}
