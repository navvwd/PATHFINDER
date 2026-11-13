import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Recommendation } from "@pathfinder/shared-types";
import { Check, Compass, Sparkles, ThumbsDown, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Modal, PageHeader, QueryState, Textarea, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

const kindLabel: Record<string, string> = {
  focus_domain: "Go deeper", promising_domain: "Promising", validation: "Validate with a challenge", activity: "Activity",
  explore_domain: "Explore", alignment: "Interest & evidence",
};

export function useRecommendationSet() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["recommendations"], queryFn: () => api.recommendations.get() });
  const gen = useMutation({ mutationFn: () => api.recommendations.generate(), onSuccess: (d) => qc.setQueryData(["recommendations"], d), onError: (e) => toast.error(e) });
  return { q, gen };
}

export function Recommendations() {
  const { gen } = useRecommendationSet();
  return (
    <>
      <PageHeader title="Your recommendations" subtitle="Explainable suggestions based on your chosen interests and recorded work."
        actions={<Button icon={<Sparkles className="size-4" />} loading={gen.isPending} onClick={() => gen.mutate()}>Refresh from my latest work</Button>} />
      <RecommendationsBody />
    </>
  );
}

/** Recommendation list without page chrome (embedded in AI Insights). */
export function RecommendationsBody() {
  const { q, gen } = useRecommendationSet();
  return (
    <>
      <QueryState q={q}>
        {(r) => (
          <div className="space-y-6">
            <Card className="p-4 text-sm"><p className="font-medium">{r.message}</p><p className="mt-1 text-subtle">{r.disclaimer}</p>{r.generated_at && <p className="mt-1 text-xs text-subtle">Generated {fmtDateTime(r.generated_at)}</p>}</Card>
            {r.status === "not_generated" && <EmptyState icon={<Compass className="size-6" />} title="No recommendations yet" action={<Button onClick={() => gen.mutate()}>Generate now</Button>} />}
            {(["focus_domain", "promising_domain", "validation", "alignment", "activity", "explore_domain"] as const).map((k) => {
              const items = r.items.filter((i) => i.kind === k && i.status !== "dismissed");
              if (!items.length) return null;
              return (
                <section key={k}>
                  <h2 className="mb-3 text-lg font-semibold">{kindLabel[k]}</h2>
                  <div className="grid gap-4 md:grid-cols-2">{items.map((i) => <RecCard key={i.id} r={i} />)}</div>
                </section>
              );
            })}
          </div>
        )}
      </QueryState>
    </>
  );
}

function RecCard({ r }: { r: Recommendation }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [disagree, setDisagree] = useState(false);
  const [why, setWhy] = useState("");
  const respond = useMutation({
    mutationFn: (v: { status: "accepted" | "dismissed" | "disagreed"; response?: string }) => api.recommendations.respond(r.id, v.status, v.response),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recommendations"] }); setDisagree(false); toast.success("Thanks - your response was recorded and shared with your mentor"); },
    onError: (e) => toast.error(e),
  });
  return (
    <Card>
      <CardHeader title={r.title} subtitle={r.domain_name ?? undefined} action={r.status !== "active" ? <Badge tone={r.status === "accepted" ? "success" : "warning"}>{r.status}</Badge> : r.confidence > 0 ? <Badge>{Math.round(r.confidence * 100)}% evidence</Badge> : null} />
      <CardBody className="space-y-3">
        <div><div className="text-xs font-semibold uppercase tracking-wide text-subtle">Why</div><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul></div>
        {r.mentor_review_status !== "pending" && <div className="rounded-lg bg-muted p-2 text-sm">Mentor {r.mentor_review_status}{r.mentor_note ? `: "${r.mentor_note}"` : ""}</div>}
        {r.student_response && <div className="text-xs text-subtle">You said: "{r.student_response}"</div>}
        {r.status === "active" && (
          <div className="flex flex-wrap gap-2">
            {r.activity_id ? <Link to={`/app/activities/${r.activity_id}`}><Button size="sm" icon={<Check className="size-4" />} onClick={() => respond.mutate({ status: "accepted" })}>Do it</Button></Link>
              : <Button size="sm" icon={<Check className="size-4" />} onClick={() => respond.mutate({ status: "accepted" })}>Sounds good</Button>}
            <Button size="sm" variant="secondary" icon={<ThumbsDown className="size-4" />} onClick={() => setDisagree(true)}>I disagree</Button>
            <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => respond.mutate({ status: "dismissed" })}>Not now</Button>
          </div>
        )}
      </CardBody>
      <Modal open={disagree} onClose={() => setDisagree(false)} title="Tell us why (optional)" footer={<Button loading={respond.isPending} onClick={() => respond.mutate({ status: "disagreed", response: why || undefined })}>Submit</Button>}>
        <p className="mb-3 text-sm text-subtle">Disagreeing is completely fine. Your interests stay yours, and your mentor will see your view.</p>
        <Textarea aria-label="Reason" value={why} onChange={(e) => setWhy(e.target.value)} />
      </Modal>
    </Card>
  );
}
