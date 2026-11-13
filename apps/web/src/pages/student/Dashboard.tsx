import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Award, Clock, Flame, Sparkles, Star, Target, Trophy, Zap } from "lucide-react";
import { Link } from "react-router";
import { TrendChart } from "@/components/charts";
import { Badge, Button, Card, CardBody, CardHeader, ConfidenceBadge, EmptyState, ProgressBar, QueryState, Stat, useToast } from "@/components/ui";
import { api, useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

export function Dashboard() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.students.dashboard() });
  const consent = useAuth((s) => s.me?.consent_status);
  const qc = useQueryClient();
  const toast = useToast();
  const regen = useMutation({
    mutationFn: () => api.recommendations.generate(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Suggestions refreshed from your latest work"); },
    onError: (e) => toast.error(e),
  });
  return (
    <QueryState q={q}>
      {(d) => {
        const junior = d.ui_mode === "junior";
        return (
          <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className={junior ? "text-3xl font-extrabold" : "text-2xl sm:text-3xl font-bold"}>{d.greeting}</h1>
                <p className="text-subtle">{junior ? "Let's learn something awesome today!" : "Here's your learning snapshot."}</p>
              </div>
              <div className="flex gap-2"><Link to="/app/activities"><Button variant="lime" icon={<Zap className="size-4" />}>Start an activity</Button></Link></div>
            </motion.div>

            {consent === "pending" && (
              <Card className="border-warning/40 bg-warning-soft p-4 text-sm"><strong>Waiting for guardian consent.</strong> Ask your parent to sign up with your invite code (Settings) - some features like AI guidance stay off until they agree.</Card>
            )}

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Level" value={`Lv ${d.stats.level as number}`} icon={<Star className="size-4 text-accent" />}
                hint={<ProgressBar value={d.stats.xp_into_level as number} max={d.stats.xp_for_next_level as number} label="XP to next level" />} />
              <Stat label="Learning streak" value={`${d.stats.current_streak} day${d.stats.current_streak === 1 ? "" : "s"}`} icon={<Flame className="size-4 text-danger" />} hint={`Best: ${d.stats.longest_streak} days`} />
              <Stat label="Activities done" value={d.stats.activities_completed as number} icon={<Target className="size-4 text-primary" />} hint={`${d.stats.assessments_completed} assessments`} />
              <Stat label="Total XP" value={d.stats.xp as number} icon={<Trophy className="size-4 text-accent" />} hint={`${d.stats.badges} recent badges`} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader title="Today's activities" subtitle="Picked from your chosen domains" action={<Link to="/app/activities" className="text-sm text-primary">See all</Link>} />
                <CardBody className="grid gap-3 sm:grid-cols-3">
                  {d.daily_activities.length === 0 && <div className="sm:col-span-3"><EmptyState title="All caught up!" body="You've tried every activity in your domains. Explore a new domain?" action={<Link to="/app/domains"><Button variant="secondary">Explore domains</Button></Link>} /></div>}
                  {d.daily_activities.map((a) => (
                    <Link key={a.id as string} to={`/app/activities/${a.id}`}>
                      <Card interactive className="h-full p-4">
                        <div className="h-1.5 w-8 rounded-full" style={{ background: a.domain_color as string }} />
                        <div className="mt-3 font-semibold leading-snug">{a.title as string}</div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-subtle"><span className="inline-flex items-center gap-1"><Clock className="size-3" />{a.estimated_minutes as number} min</span><span>+{a.xp_reward as number} XP</span></div>
                      </Card>
                    </Link>
                  ))}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Weekly goals" action={<Link to="/app/achievements" className="text-sm text-primary">Manage</Link>} />
                <CardBody className="space-y-4">
                  {d.weekly_goals.map((g) => (
                    <div key={g.id as string}>
                      <div className="mb-1.5 flex justify-between text-sm"><span>{g.title as string}</span><span className="text-subtle">{g.current as number}/{g.target as number}</span></div>
                      <ProgressBar value={g.current as number} max={g.target as number} color={g.status === "completed" ? "var(--pf-success)" : undefined} />
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader title="Your progress" subtitle="Average score of reviewed work per week (last 8 weeks)" action={<Link to="/app/progress" className="text-sm text-primary">Details</Link>} />
                <CardBody>{d.progress_chart.length ? <TrendChart data={d.progress_chart as never} /> : <EmptyState title="No scores yet" body="Complete an activity or assessment to start your growth chart." />}</CardBody>
              </Card>
              <Card>
                <CardHeader title="My domains" action={<Link to="/app/interests" className="text-sm text-primary">Edit</Link>} />
                <CardBody className="space-y-3">
                  {d.selected_domains.length === 0 && <EmptyState title="No interests yet" action={<Link to="/app/interests"><Button size="sm">Choose interests</Button></Link>} />}
                  {d.selected_domains.map((s) => (
                    <Link key={s.domain_id as string} to={`/app/domains/${s.slug}`} className="flex items-center justify-between rounded-xl p-2 hover:bg-muted">
                      <span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: s.color as string }} />{s.name as string}{s.is_favourite ? <Star className="size-3.5 fill-accent text-accent" /> : null}</span>
                      <ConfidenceBadge label={s.confidence_label as string} />
                    </Link>
                  ))}
                </CardBody>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader title="Pending challenges" />
                <CardBody className="space-y-2">
                  {d.pending_challenges.length === 0 && <p className="text-sm text-subtle">Nothing pending. Nice!</p>}
                  {d.pending_challenges.map((p) => (
                    <Link key={(p.assignment_id ?? p.attempt_id) as string} to={p.type === "assessment" ? `/app/assessments/${p.id}/take` : `/app/activities/${p.id}`} className="block rounded-xl border border-line p-3 hover:bg-muted">
                      <div className="text-sm font-medium">{p.title as string}</div>
                      <div className="text-xs text-subtle">{p.type === "assessment" ? "Assessment in progress" : p.due_at ? `Due ${fmtDate(p.due_at as string)}` : "Assigned by your mentor"}</div>
                    </Link>
                  ))}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Suggested for you" subtitle="Explainable, based on your records" action={<Button size="sm" variant="ghost" loading={regen.isPending} onClick={() => regen.mutate()}><Sparkles className="size-4" /></Button>} />
                <CardBody className="space-y-3">
                  {d.recommendations.length === 0 && <p className="text-sm text-subtle">No suggestions yet - tap the sparkle to generate.</p>}
                  {d.recommendations.map((r) => (
                    <Link key={r.id as string} to={r.activity_id ? `/app/activities/${r.activity_id}` : "/app/recommendations"} className="block rounded-xl bg-muted p-3 hover:opacity-90">
                      <div className="text-sm font-medium">{r.title as string}</div>
                      <div className="mt-0.5 text-xs text-subtle line-clamp-2">{(r.reasons as string[])[0]}</div>
                    </Link>
                  ))}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Achievements & milestones" />
                <CardBody className="space-y-2">
                  {d.recent_achievements.map((a) => <div key={a.title as string} className="flex items-center gap-2 text-sm"><Award className="size-4 text-accent" />{a.title as string}<span className="ml-auto text-xs text-subtle">{fmtDate(a.awarded_at as string)}</span></div>)}
                  {d.milestones.map((m) => <Link key={m.id as string} to={`/app/roadmap/${m.roadmap_id}`} className="flex items-center gap-2 text-sm hover:text-primary"><ArrowRight className="size-4" />{m.title as string}<Badge className="ml-auto">{fmtDate(m.due_date as string, { day: "numeric", month: "short" })}</Badge></Link>)}
                  {d.recent_achievements.length + d.milestones.length === 0 && <p className="text-sm text-subtle">Earn badges by completing activities. Create a roadmap for milestones.</p>}
                  {d.portfolio_highlights.length > 0 && <div className="pt-2 text-xs text-subtle">Portfolio: {d.portfolio_highlights.map((p) => p.title as string).join(", ")}</div>}
                </CardBody>
              </Card>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
