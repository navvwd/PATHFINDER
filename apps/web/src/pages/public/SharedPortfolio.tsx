import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";
import { Badge, Card, EmptyState, QueryState } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDate, titleCase } from "@/lib/format";

export function SharedPortfolio() {
  const { token = "" } = useParams();
  const q = useQuery({ queryKey: ["shared", token], queryFn: () => api.portfolios.shared(token), retry: false });
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <QueryState q={q}>
        {(p) => (
          <>
            <h1 className="text-3xl font-bold">{p.title}</h1>
            <p className="mt-1 text-subtle">{p.student_name} · shared with guardian approval</p>
            {p.bio && <p className="mt-4">{p.bio}</p>}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {p.items.length === 0 && <EmptyState title="No items yet" />}
              {p.items.map((i) => (
                <Card key={i.id} className="p-5">
                  <Badge tone="primary">{titleCase(i.category)}</Badge>
                  <h3 className="mt-2 font-semibold">{i.title}</h3>
                  {i.description && <p className="mt-1 text-sm text-subtle line-clamp-4">{i.description}</p>}
                  <p className="mt-3 text-xs text-subtle">{fmtDate(i.created_on)}</p>
                  {i.external_url && <a href={i.external_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-sm text-primary-ink underline">View link</a>}
                </Card>
              ))}
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
