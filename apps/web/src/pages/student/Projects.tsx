import { useMutation, useQuery } from "@tanstack/react-query";
import { Lightbulb } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { AiLabel, Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, QueryState, Select, Table, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDateTime, titleCase } from "@/lib/format";

export function Projects() {
  const subs = useQuery({ queryKey: ["submissions", "all"], queryFn: () => api.submissions.list({ page_size: 50 }) });
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const [domain, setDomain] = useState("");
  const toast = useToast();
  const ideas = useMutation({ mutationFn: () => api.ai.projectIdeas(domain), onError: (e) => toast.error(e) });
  return (
    <>
      <PageHeader title="Project workspace" subtitle="Everything you've submitted, its review status, and ideas for what to build next." />
      <Card className="mb-6">
        <CardHeader title="Need a project idea?" subtitle="Ideas are generated from your interests, age band and current level" />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Domain for ideas" className="max-w-xs" value={domain} onChange={(e) => setDomain(e.target.value)}><option value="">Choose a domain</option>{domains.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            <Button icon={<Lightbulb className="size-4" />} disabled={!domain} loading={ideas.isPending} onClick={() => ideas.mutate()}>Suggest projects</Button>
          </div>
          {ideas.data && (
            <div className="mt-4 space-y-3">
              <AiLabel {...ideas.data} />
              <div className="grid gap-3 md:grid-cols-3">
                {ideas.data.data.ideas.map((p) => (
                  <Card key={p.title} className="p-4">
                    <h4 className="font-semibold">{p.title}</h4><p className="mt-1 text-sm text-subtle">{p.description}</p>
                    <ol className="mt-2 list-decimal pl-4 text-sm">{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                    <div className="mt-2 flex flex-wrap gap-1">{p.skills_practised.map((s) => <Badge key={s}>{s}</Badge>)}<Badge tone="primary">~{p.estimated_hours}h</Badge></div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
      <QueryState q={subs} isEmpty={(d) => !d.items.length} empty={<EmptyState title="No submissions yet" body="Complete an activity to see it here." action={<Link to="/app/activities"><Button>Browse activities</Button></Link>} />}>
        {(d) => (
          <Table rows={d.items} rowKey={(r) => r.id} columns={[
            { key: "a", header: "Activity", render: (r) => <Link className="text-primary-ink hover:underline" to={`/app/activities/${r.activity_id}`}>{r.activity_title}</Link> },
            { key: "n", header: "Attempt", render: (r) => r.attempt_no },
            { key: "s", header: "Status", render: (r) => <Badge tone={r.status === "evaluated" ? "success" : r.status === "returned" ? "warning" : "primary"}>{titleCase(r.status)}</Badge> },
            { key: "sc", header: "Score", render: (r) => { const e = r.evaluations.find((x) => x.is_current); return e ? `${e.normalized_score.toFixed(0)}%` : "-"; } },
            { key: "d", header: "Submitted", render: (r) => fmtDateTime(r.submitted_at) },
          ]} />
        )}
      </QueryState>
    </>
  );
}
