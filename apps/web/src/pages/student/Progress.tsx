import { useMutation, useQuery } from "@tanstack/react-query";
import type { DomainScore } from "@pathfinder/shared-types";
import { dimensionLabels } from "@pathfinder/design-system";
import { Info, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useState } from "react";
import { DimensionRadar, DomainBars, TrendChart } from "@/components/charts";
import { AiLabel, Badge, Button, Card, CardBody, CardHeader, ConfidenceBadge, EmptyState, ProgressBar, QueryState, Stat, Tabs, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDateTime, score, titleCase } from "@/lib/format";

const trendIcon = { improving: <TrendingUp className="size-4 text-success" />, declining: <TrendingDown className="size-4 text-danger" />, steady: <Minus className="size-4 text-info" /> } as Record<string, React.ReactNode>;

/** Shared by student, parent and mentor views. */
export function ProgressPanel({ studentId, showAi = true }: { studentId?: string; showAi?: boolean }) {
  const summary = useQuery({ queryKey: ["progress", studentId], queryFn: () => api.progress.summary(studentId) });
  const scores = useQuery({ queryKey: ["domain-scores", studentId], queryFn: () => api.analytics.domainScores(studentId) });
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const timeline = useQuery({ queryKey: ["timeline", studentId, period], queryFn: () => api.progress.timeline({ student_id: studentId, period }) });
  const [domain, setDomain] = useState<string | null>(null);
  return (
    <QueryState q={summary}>
      {(s) => {
        const o = s.overall;
        const selected = scores.data?.find((x) => x.domain_id === (domain ?? scores.data?.find((y) => y.skill_score !== null)?.domain_id));
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Initial performance" value={score(o.initial_performance)} hint="First attempt on repeated work" />
              <Stat label="Current performance" value={score(o.current_performance)} hint="Latest attempt on the same work" />
              <Stat label="Improvement" value={o.improvement_points == null ? "-" : `${o.improvement_points > 0 ? "+" : ""}${o.improvement_points.toFixed(1)} pts`} icon={trendIcon[o.trend_label]} hint={titleCase(o.trend_label)} />
              <Stat label="Consistency" value={o.consistency == null ? "-" : `${o.consistency.toFixed(0)}%`} hint={`Completion ${o.completion_rate == null ? "-" : `${o.completion_rate}%`}`} />
            </div>
            <Card className="flex gap-3 p-4 text-sm text-subtle"><Info className="size-5 shrink-0 text-info" /><div>{s.notes.concat(o.notes).join(" ")} Interest (what you chose) and demonstrated skill are shown separately.</div></Card>
            <div className="grid gap-6 lg:grid-cols-2">
              <Card><CardHeader title="Interest vs demonstrated skill" subtitle="Faded bars = not yet measured" /><CardBody>{scores.data ? <DomainBars scores={scores.data} /> : null}</CardBody></Card>
              <Card><CardHeader title="Score trend" action={<Tabs value={period} onChange={setPeriod} tabs={[{ key: "daily", label: "Day" }, { key: "weekly", label: "Week" }, { key: "monthly", label: "Month" }]} />} />
                <CardBody>{timeline.data?.some((t) => t.average_score != null) ? <TrendChart data={timeline.data} /> : <EmptyState title="No scored work yet" />}</CardBody></Card>
            </div>
            <Card>
              <CardHeader title="Domain-wise progress" subtitle="Click a domain to see how its score is explained" />
              <CardBody className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
                <div className="space-y-2">
                  {s.domains.map((d) => (
                    <button key={d.domain_id} onClick={() => setDomain(d.domain_id)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.domain_id === d.domain_id ? "border-primary bg-primary-soft/40" : "border-line hover:bg-muted"}`}>
                      <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: d.color }} />{d.domain_name}</span>
                        <Badge tone={d.status === "assessed" ? "success" : d.status === "emerging" ? "warning" : "neutral"}>{d.status === "unexplored" ? "Not yet explored" : d.status}</Badge></div>
                      <div className="mt-2 flex items-center gap-3"><ProgressBar value={d.skill_score ?? 0} color={d.color} label={`${d.domain_name} skill`} /><span className="w-10 text-right text-sm">{score(d.skill_score)}</span></div>
                      <div className="mt-1 flex justify-between text-xs text-subtle"><ConfidenceBadge label={d.confidence_label} /><span>{d.evidence_count} records</span></div>
                    </button>
                  ))}
                </div>
                {selected ? <ScoreExplanation s={selected} /> : <EmptyState title="Nothing measured yet" />}
              </CardBody>
            </Card>
            {showAi && <AiSummary studentId={studentId} />}
            <EventLog studentId={studentId} />
          </div>
        );
      }}
    </QueryState>
  );
}

function ScoreExplanation({ s }: { s: DomainScore }) {
  return (
    <div>
      <h3 className="font-semibold">{s.domain_name}</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted p-2"><div className="text-xs text-subtle">Interest</div><div className="text-lg font-bold">{score(s.interest_score)}</div></div>
        <div className="rounded-xl bg-muted p-2"><div className="text-xs text-subtle">Skill</div><div className="text-lg font-bold">{score(s.skill_score)}</div></div>
        <div className="rounded-xl bg-muted p-2"><div className="text-xs text-subtle">Progress</div><div className="text-lg font-bold">{score(s.progress_score)}</div></div>
      </div>
      {s.skill_score !== null && <DimensionRadar score={s} height={220} />}
      <ul className="mt-2 space-y-1 text-sm">{(s.dimensions as Array<{ key: string; value: number | null; weight: number; explanation: string }>).map((d) => (
        <li key={d.key} className="flex gap-2"><span className="w-36 shrink-0 font-medium">{dimensionLabels[d.key]} <span className="text-xs text-subtle">({Math.round(d.weight * 100)}%)</span></span><span className="text-subtle">{d.value == null ? "-" : d.value.toFixed(0)} · {d.explanation}</span></li>
      ))}</ul>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-subtle">{s.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
      <p className="mt-2 text-xs text-subtle">Scoring model v{s.scoring_config_version}. Not an IQ score or diagnosis.</p>
    </div>
  );
}

function AiSummary({ studentId }: { studentId?: string }) {
  const toast = useToast();
  const m = useMutation({ mutationFn: () => api.ai.summary(studentId), onError: (e) => toast.error(e) });
  return (
    <Card>
      <CardHeader title="Progress summary" subtitle="Grounded in your recorded activities" action={<Button size="sm" variant="soft" loading={m.isPending} onClick={() => m.mutate()}>Generate</Button>} />
      {m.data && <CardBody className="space-y-3">
        <AiLabel {...m.data} />
        <p className="font-medium">{m.data.data.headline}</p>
        <div className="grid gap-4 md:grid-cols-3 text-sm">
          <div><h4 className="mb-1 font-semibold">Highlights</h4><ul className="list-disc pl-4">{m.data.data.highlights.map((h) => <li key={h}>{h}</li>)}</ul></div>
          <div><h4 className="mb-1 font-semibold">Keep practising</h4><ul className="list-disc pl-4">{m.data.data.growth_areas.map((h) => <li key={h}>{h}</li>)}</ul></div>
          <div><h4 className="mb-1 font-semibold">Next steps</h4><ul className="list-disc pl-4">{m.data.data.next_steps.map((h) => <li key={h}>{h}</li>)}</ul></div>
        </div>
      </CardBody>}
    </Card>
  );
}

function EventLog({ studentId }: { studentId?: string }) {
  const q = useQuery({ queryKey: ["events", studentId], queryFn: () => api.progress.events({ student_id: studentId, page_size: 15 }) });
  return (
    <Card><CardHeader title="Recent learning events" /><CardBody>
      <QueryState q={q} isEmpty={(d) => !d.items.length} empty={<p className="text-sm text-subtle">No events yet.</p>}>
        {(d) => <ul className="divide-y divide-line">{d.items.map((e) => (
          <li key={e.id} className="flex items-center justify-between py-2 text-sm"><span>{titleCase(e.event_type)}{(e.payload as { title?: string }).title ? `: ${(e.payload as { title?: string }).title}` : ""}</span>
            <span className="flex items-center gap-3 text-xs text-subtle">{e.score_pct != null && <Badge tone="primary">{e.score_pct.toFixed(0)}%</Badge>}{fmtDateTime(e.occurred_at)}</span></li>))}</ul>}
      </QueryState>
    </CardBody></Card>
  );
}
