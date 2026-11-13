/* Student growth pages: Challenges, My Skills, Growth Timeline, AI Insights. */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { DomainScore } from "@pathfinder/shared-types";
import { dimensionLabels } from "@pathfinder/design-system";
import { Bot, Brain, Lightbulb, MessageCircle, Sparkles, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { DimensionRadar, TrendChart } from "@/components/charts";
import {
  AiLabel, Badge, Button, Card, CardBody, CardHeader, ConfidenceBadge, EmptyState, PageHeader, ProgressBar, QueryState, Select, Skeleton, Tabs, Textarea, useToast,
} from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDate, score, titleCase } from "@/lib/format";
import { ActivityCard } from "./Activities";
import { RecommendationsBody } from "./Recommendations";

/* ---------------------------------------------------------------- Challenges */
const CHALLENGE_CATEGORIES = ["coding_challenge", "logical_puzzle", "science_experiment", "business_simulation", "team_challenge", "public_speaking"];

export function Challenges() {
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const [domain, setDomain] = useState("");
  const q = useQuery({ queryKey: ["challenges", domain], queryFn: () => api.activities.list({ domain_id: domain || undefined, page_size: 100 }) });
  const list = useMemo(() => q.data?.items.filter((a) => CHALLENGE_CATEGORIES.includes(a.category)) ?? [], [q.data]);
  return (
    <>
      <PageHeader title="Challenges" subtitle="Discover what you can do by doing it. Puzzles, experiments, simulations and speaking challenges matched to your age."
        actions={<Select aria-label="Domain" className="w-56" value={domain} onChange={(e) => setDomain(e.target.value)}><option value="">All domains</option>{domains.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>} />
      <QueryState q={q} skeleton={<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>}>
        {() => list.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map((a) => <ActivityCard key={a.id} a={a} />)}</div>
          : <EmptyState title="No challenges here yet" body="Try another domain, or explore all activities." action={<Link to="/app/activities"><Button variant="secondary">All activities</Button></Link>} />}
      </QueryState>
    </>
  );
}

/* ---------------------------------------------------------------- My Skills */
export function Skills() {
  const q = useQuery({ queryKey: ["domain-scores"], queryFn: () => api.analytics.domainScores() });
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="My Skills" subtitle="Demonstrated skill from reviewed work, shown separately from what you chose and how much evidence there is. Not an IQ score." />
      <QueryState q={q}>
        {(scores) => {
          const measured = scores.filter((s) => s.skill_score !== null);
          const current = scores.find((s) => s.domain_id === (sel ?? measured[0]?.domain_id)) ?? scores[0];
          return (
            <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
              <div className="space-y-3">
                {scores.map((s) => (
                  <button key={s.domain_id} onClick={() => setSel(s.domain_id)} aria-pressed={current?.domain_id === s.domain_id}
                    className={`w-full rounded-[var(--radius-card)] border p-4 text-left transition ${current?.domain_id === s.domain_id ? "border-[var(--pf-primary)] bg-surface shadow-card" : "border-line bg-surface hover:border-ink/20"}`}>
                    <div className="flex items-center justify-between"><span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: s.domain_color ?? undefined }} />{s.domain_name}</span><ConfidenceBadge label={s.confidence_label} /></div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <Metric k="Interest" v={score(s.interest_score)} /><Metric k="Skill" v={score(s.skill_score)} /><Metric k="Progress" v={score(s.progress_score)} />
                    </div>
                  </button>
                ))}
              </div>
              {current && <SkillDetail s={current} />}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

const Metric = ({ k, v }: { k: string; v: string }) => <div className="rounded-xl bg-muted p-2"><div className="text-[11px] text-subtle">{k}</div><div className="num text-lg text-ink">{v}</div></div>;

function SkillDetail({ s }: { s: DomainScore }) {
  const dims = s.dimensions as Array<{ key: string; value: number | null; weight: number; explanation: string }>;
  return (
    <Card className="h-fit lg:sticky lg:top-20">
      <CardHeader title={s.domain_name} subtitle={`${s.evidence_count} records · scoring model v${s.scoring_config_version}`} />
      <CardBody>
        {s.skill_score !== null ? <DimensionRadar score={s} height={260} /> : <EmptyState title="Not yet explored" body="Complete a couple of activities here to see your skill profile. Unexplored is an opportunity, not a weakness." />}
        <ul className="mt-4 space-y-3">
          {dims.map((d) => (
            <li key={d.key}>
              <div className="flex justify-between text-sm"><span className="font-medium">{dimensionLabels[d.key]} <span className="text-xs text-subtle">weight {Math.round(d.weight * 100)}%</span></span><span className="num">{d.value == null ? "-" : d.value.toFixed(0)}</span></div>
              <div className="mt-1"><ProgressBar value={d.value ?? 0} label={dimensionLabels[d.key]} /></div>
              <p className="mt-1 text-xs text-subtle">{d.explanation}</p>
            </li>
          ))}
        </ul>
        <ul className="mt-5 list-disc space-y-1 pl-5 text-xs text-subtle">{s.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
      </CardBody>
    </Card>
  );
}

/* ---------------------------------------------------------------- Growth Timeline */
export function Timeline() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const chart = useQuery({ queryKey: ["timeline", undefined, period], queryFn: () => api.progress.timeline({ period }) });
  const events = useQuery({ queryKey: ["events", "timeline"], queryFn: () => api.progress.events({ page_size: 60 }) });
  const toast = useToast();
  const [text, setText] = useState("");
  const reflect = useMutation({ mutationFn: () => api.progress.reflect({ text }), onSuccess: () => { setText(""); void events.refetch(); toast.success("Reflection added to your timeline"); }, onError: (e) => toast.error(e) });
  const grouped = useMemo(() => {
    const m = new Map<string, NonNullable<typeof events.data>["items"]>();
    for (const e of events.data?.items ?? []) {
      const k = fmtDate(e.occurred_at, { month: "long", year: "numeric" });
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [events.data]);
  return (
    <>
      <PageHeader title="Growth Timeline" subtitle="Everything you've done, in order. Your story of growth - compared only with your past self." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card><CardHeader title="Scores on reviewed work" action={<Tabs value={period} onChange={setPeriod} tabs={[{ key: "daily", label: "Day" }, { key: "weekly", label: "Week" }, { key: "monthly", label: "Month" }]} />} />
            <CardBody><QueryState q={chart} isEmpty={(d) => !d.some((p) => p.average_score != null)} empty={<EmptyState title="No scored work yet" />}>{(d) => <TrendChart data={d} />}</QueryState></CardBody></Card>
          <Card><CardHeader title="Timeline" /><CardBody>
            <QueryState q={events} isEmpty={(d) => !d.items.length} empty={<EmptyState title="Your timeline starts with your first activity" />}>
              {() => (
                <div className="space-y-8">
                  {grouped.map(([month, items]) => (
                    <section key={month}>
                      <h3 className="mb-3 text-sm font-medium text-subtle">{month}</h3>
                      <ol className="relative space-y-4 border-l border-line pl-6">
                        {items.map((e) => (
                          <li key={e.id} className="relative">
                            <span className={`absolute -left-[29px] top-1.5 size-2.5 rounded-full ${e.score_pct != null ? "bg-[var(--pf-primary)]" : "bg-line"}`} />
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-sm text-ink">{titleCase(e.event_type)}{(e.payload as { title?: string }).title ? <span className="text-subtle"> · {(e.payload as { title?: string }).title}</span> : null}</p>
                              <span className="flex items-center gap-2 text-xs text-subtle">{e.score_pct != null && <Badge tone="primary">{e.score_pct.toFixed(0)}%</Badge>}{fmtDate(e.occurred_at, { day: "numeric", month: "short" })}</span>
                            </div>
                            {(e.payload as { text?: string }).text && <p className="mt-1 text-sm text-subtle">"{(e.payload as { text?: string }).text}"</p>}
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              )}
            </QueryState>
          </CardBody></Card>
        </div>
        <Card className="h-fit lg:sticky lg:top-20"><CardHeader title="Add a reflection" subtitle="What did you learn? What do you want to try next?" />
          <CardBody className="space-y-3"><Textarea aria-label="Reflection" value={text} onChange={(e) => setText(e.target.value)} />
            <Button className="w-full" disabled={text.trim().length < 3} loading={reflect.isPending} onClick={() => reflect.mutate()}>Add to timeline</Button></CardBody></Card>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- AI Insights */
export function Insights() {
  const toast = useToast();
  const [tab, setTab] = useState<"insights" | "recommendations">("insights");
  const status = useQuery({ queryKey: ["ai-status"], queryFn: () => api.ai.status() });
  const summary = useMutation({ mutationFn: () => api.ai.summary(), onError: (e) => toast.error(e) });
  const interests = useMutation({ mutationFn: () => api.ai.interestAnalysis(), onError: (e) => toast.error(e) });
  const skills = useMutation({ mutationFn: () => api.ai.skillSuggestions(), onError: (e) => toast.error(e) });
  const generateAll = () => { summary.mutate(); interests.mutate(); skills.mutate(); };
  const busy = summary.isPending || interests.isPending || skills.isPending;
  return (
    <>
      <PageHeader title="AI Insights" subtitle="Your growth deserves more than a single score. Insights are grounded in your records and always explain themselves."
        actions={<><Link to="/app/assistant"><Button variant="secondary" icon={<MessageCircle className="size-4" />}>Ask the assistant</Button></Link>
          <Button icon={<Sparkles className="size-4" />} loading={busy} onClick={generateAll}>Generate insights</Button></>} />
      <Card className="mb-6 flex flex-wrap items-center gap-3 p-4 text-sm text-subtle">
        <Bot className="size-5 text-primary-ink" />
        {status.data ? (status.data.llm_enabled ? `AI model: ${status.data.model}.` : "AI model not configured - insights come from the rule-based engine.") : "Checking AI status..."}
        <span>Insights support your exploration; they never decide your future.</span>
      </Card>
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "insights", label: "Insights" }, { key: "recommendations", label: "Recommendations" }]} />
      <div className="mt-6">
        {tab === "recommendations" ? <RecommendationsBody /> : (
          <div className="grid gap-6 lg:grid-cols-3">
            <InsightCard title="Progress summary" icon={<Target className="size-5" />} m={summary}
              render={(d: { headline: string; highlights: string[]; next_steps: string[] }) => (<>
                <p className="font-display text-lg text-ink">{d.headline}</p>
                <List title="Highlights" items={d.highlights} /><List title="Next steps" items={d.next_steps} /></>)} />
            <InsightCard title="Interest patterns" icon={<Lightbulb className="size-5" />} m={interests}
              render={(d: { summary: string; aligned_interests: string[]; keep_exploring: string[]; worth_trying: string[] }) => (<>
                <p className="text-ink">{d.summary}</p>
                <List title="Backed by your work" items={d.aligned_interests} /><List title="Keep exploring" items={d.keep_exploring} /><List title="Worth trying" items={d.worth_trying} /></>)} />
            <InsightCard title="Skill development" icon={<Brain className="size-5" />} m={skills}
              render={(d: { suggestions: string[] }) => <List title="Suggestions" items={d.suggestions} />} />
          </div>
        )}
      </div>
    </>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <div className="mt-4"><p className="text-xs font-medium uppercase tracking-wide text-subtle">{title}</p><ul className="mt-1.5 space-y-1 text-sm text-ink">{items.map((i) => <li key={i} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--pf-primary)]" />{i}</li>)}</ul></div>;
}

function InsightCard<T>({ title, icon, m, render }: { title: string; icon: React.ReactNode; m: { data?: { source: string; label: string; note?: string | null; data: T }; isPending: boolean; mutate: () => void }; render: (d: T) => React.ReactNode }) {
  return (
    <Card><CardHeader title={<span className="flex items-center gap-2"><span className="text-primary-ink">{icon}</span>{title}</span>} action={<Button size="sm" variant="ghost" loading={m.isPending} onClick={() => m.mutate()}>Run</Button>} />
      <CardBody>
        {m.isPending ? <Skeleton className="h-32" /> : m.data ? <><AiLabel source={m.data.source} label={m.data.label} note={m.data.note} />{render(m.data.data)}</>
          : <p className="text-sm text-subtle">Press <strong>Generate insights</strong> to analyse your latest records.</p>}
      </CardBody>
    </Card>
  );
}
