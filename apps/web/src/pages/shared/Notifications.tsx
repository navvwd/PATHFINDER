import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, cx, EmptyState, PageHeader, Pagination, QueryState, Tabs } from "@/components/ui";
import { api } from "@/lib/auth";
import { relTime } from "@/lib/format";

export function Notifications() {
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["notifications", tab, page], queryFn: () => api.notifications.list({ unread_only: tab === "unread", page, page_size: 20 }) });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["notifications"] }); qc.invalidateQueries({ queryKey: ["unread"] }); };
  const all = useMutation({ mutationFn: () => api.notifications.readAll(), onSuccess: refresh });
  const open = async (id: string, link: string | null) => { await api.notifications.read(id); refresh(); if (link?.startsWith("/")) navigate(link); };
  return (
    <>
      <PageHeader title="Notifications" actions={<Button variant="secondary" icon={<CheckCheck className="size-4" />} loading={all.isPending} onClick={() => all.mutate()}>Mark all read</Button>} />
      <Tabs value={tab} onChange={(t) => { setTab(t); setPage(1); }} tabs={[{ key: "all", label: "All" }, { key: "unread", label: "Unread" }]} />
      <div className="mt-4">
        <QueryState q={q} isEmpty={(d) => !d.items.length} empty={<EmptyState icon={<Bell className="size-6" />} title="You're all caught up" />}>
          {(d) => (<>
            <Card className="divide-y divide-line">
              {d.items.map((n) => (
                <button key={n.id} onClick={() => open(n.id, n.link)} className={cx("flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-muted", !n.read_at && "bg-primary-soft/30")}>
                  <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} />
                  <div className="flex-1"><div className="text-sm font-medium">{n.title}</div>{n.body && <div className="text-sm text-subtle">{n.body}</div>}</div>
                  <span className="text-xs text-subtle">{relTime(n.created_at)}</span>
                </button>
              ))}
            </Card>
            <Pagination page={page} pageSize={20} total={d.total} onPage={setPage} />
          </>)}
        </QueryState>
      </div>
    </>
  );
}
