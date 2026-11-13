import { useQuery } from "@tanstack/react-query";
import { categoryLabels } from "@pathfinder/design-system";
import { CheckCircle2, ExternalLink, Layers } from "lucide-react";
import { Link, useParams } from "react-router";
import { ActivityCard } from "./Activities";
import { Badge, Button, Card, CardBody, CardHeader, ConfidenceBadge, EmptyState, PageHeader, QueryState } from "@/components/ui";
import { api } from "@/lib/auth";

export function Domains() {
  const q = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const scores = useQuery({ queryKey: ["domain-scores"], queryFn: () => api.analytics.domainScores() });
  const interests = useQuery({ queryKey: ["interests"], queryFn: () => api.interests.list() });
  return (
    <>
      <PageHeader title="Six domains to explore" subtitle="Open any domain to see what it involves. Exploring doesn't commit you to anything." />
      <QueryState q={q}>
        {(domains) => (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {domains.map((d) => {
              const s = scores.data?.find((x) => x.domain_id === d.id);
              const chosen = interests.data?.some((i) => i.domain_id === d.id && !i.subdomain_id);
              return (
                <Link key={d.id} to={`/app/domains/${d.slug}`}>
                  <Card interactive className="h-full overflow-hidden">
                    <div className="h-2" style={{ background: d.color }} />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-lg font-semibold">{d.name}</h2>
                        {chosen && <Badge tone="primary">My interest</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-subtle">{d.tagline}</p>
                      <div className="mt-4 flex flex-wrap gap-1.5">{d.subdomains.slice(0, 5).map((s) => <Badge key={s.id}>{s.name}</Badge>)}{d.subdomains.length > 5 && <Badge>+{d.subdomains.length - 5}</Badge>}</div>
                      <div className="mt-4"><ConfidenceBadge label={s?.confidence_label ?? "none"} /></div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </QueryState>
    </>
  );
}

export function DomainDetail() {
  const { slug = "" } = useParams();
  const q = useQuery({ queryKey: ["domain", slug], queryFn: () => api.domains.get(slug) });
  const acts = useQuery({ queryKey: ["activities", "domain", q.data?.id], enabled: !!q.data, queryFn: () => api.activities.list({ domain_id: q.data!.id, page_size: 6 }) });
  const assessments = useQuery({ queryKey: ["assessments", "domain", q.data?.id], enabled: !!q.data, queryFn: () => api.assessments.list({ domain_id: q.data!.id }) });
  return (
    <QueryState q={q}>
      {(d) => (
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="p-6 sm:p-8" style={{ background: `linear-gradient(135deg, ${d.color}22, transparent)` }}>
              <Link to="/app/domains" className="text-sm text-subtle hover:text-ink">← All domains</Link>
              <h1 className="mt-2 text-3xl font-bold">{d.name}</h1>
              <p className="mt-2 max-w-3xl text-subtle">{d.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="primary">{Object.values(d.activity_counts).reduce((a, b) => a + b, 0)} activities</Badge>
                <Badge>{d.challenge_count} challenges</Badge><Badge>{d.project_count} projects</Badge><Badge>{d.assessment_count} assessments</Badge>
              </div>
            </div>
          </Card>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card><CardHeader title="Why explore it?" /><CardBody><ul className="space-y-2">{d.advantages.map((a) => <li key={a} className="flex gap-2 text-sm"><CheckCircle2 className="size-4 shrink-0 text-success" />{a}</li>)}</ul></CardBody></Card>
            <Card><CardHeader title="Skill categories" /><CardBody className="flex flex-wrap gap-2">{d.skill_categories.map((s) => <Badge key={s} tone="primary">{s}</Badge>)}</CardBody></Card>
            <Card><CardHeader title="Development roadmap" /><CardBody><ol className="space-y-2">{d.roadmap_template.map((r, i) => <li key={i} className="text-sm"><strong>{i + 1}. {r.stage as string}</strong> <span className="text-subtle">- {r.description as string}</span></li>)}</ol></CardBody></Card>
          </div>
          <section>
            <h2 className="mb-3 text-xl font-semibold">Subdomains</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {d.subdomains.map((s) => <Link key={s.id} to={`/app/subdomains/${s.id}`}><Card interactive className="p-4"><div className="font-medium">{s.name}</div><div className="mt-1 text-xs text-subtle">{s.description}</div></Card></Link>)}
            </div>
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-semibold">Activities & challenges</h2><Link to={`/app/activities?domain=${d.id}`}><Button variant="ghost" size="sm">See all</Button></Link></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{acts.data?.items.map((a) => <ActivityCard key={a.id} a={a} />)}</div>
            {acts.data && !acts.data.items.length && <EmptyState title="No activities for your age group yet" />}
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Assessments" />
              <CardBody className="space-y-2">
                {assessments.data?.items.map((a) => <Link key={a.id} to={`/app/assessments/${a.id}/take`} className="flex items-center justify-between rounded-xl p-2 hover:bg-muted"><span className="text-sm">{a.title}</span><Badge>{a.type.replace(/_/g, " ")}</Badge></Link>)}
                {assessments.data?.items.length === 0 && <p className="text-sm text-subtle">No assessments for your age group.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Learning resources" />
              <CardBody className="space-y-2">
                {d.resources.map((r) => <a key={r.id} href={r.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl p-2 text-sm hover:bg-muted">{r.title}<span className="flex items-center gap-1 text-xs text-subtle">{r.kind}<ExternalLink className="size-3" /></span></a>)}
                {d.resources.length === 0 && <p className="text-sm text-subtle">Resources coming soon.</p>}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </QueryState>
  );
}

export function SubdomainDetail() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["subdomain", id], queryFn: () => api.domains.subdomain(id) });
  return (
    <QueryState q={q}>
      {(d) => (
        <>
          <Link to={`/app/domains/${d.domain.slug}`} className="text-sm text-subtle hover:text-ink">← {d.domain.name}</Link>
          <PageHeader title={d.subdomain.name} subtitle={d.subdomain.description} />
          <h2 className="mb-3 font-semibold">Activities</h2>
          {d.activities.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{d.activities.map((a) => <ActivityCard key={a.id} a={a} />)}</div>
            : <EmptyState icon={<Layers className="size-6" />} title="No activities here yet" body="Check the domain page for related activities." />}
          {d.resources.length > 0 && (
            <Card className="mt-6"><CardHeader title="Resources" /><CardBody className="space-y-2">{d.resources.map((r) => <a key={r.id} className="block text-sm text-primary underline" href={r.url ?? "#"} target="_blank" rel="noopener noreferrer">{r.title}</a>)}</CardBody></Card>
          )}
          <p className="mt-4 text-xs text-subtle">Categories here: {[...new Set(d.activities.map((a) => categoryLabels[a.category]))].join(", ") || "-"}</p>
        </>
      )}
    </QueryState>
  );
}
