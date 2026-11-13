import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dimensionLabels } from "@pathfinder/design-system";
import { useEffect, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Pagination, QueryState, Select, Table, Tabs, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

export function ScoringConfig() {
  const q = useQuery({ queryKey: ["scoring"], queryFn: () => api.analytics.scoringVersions() });
  const [w, setW] = useState<Record<string, number> | null>(null);
  const [note, setNote] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (q.data?.[0] && !w) setW(q.data[0].weights as Record<string, number>); }, [q.data, w]);
  const total = Object.values(w ?? {}).reduce((a, b) => a + b, 0);
  const save = useMutation({ mutationFn: () => api.analytics.newScoring({ weights: w!, note }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["scoring"] }); toast.success("New scoring version active. Historical scores keep their original version."); setNote(""); }, onError: (e) => toast.error(e) });
  return (
    <>
      <PageHeader title="Scoring configuration" subtitle="Transparent, versioned weights for the multidimensional skill score." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Dimension weights" subtitle={`Total ${(total * 100).toFixed(0)}% (must be 100%)`} />
          <CardBody className="space-y-4">
            {w && Object.entries(w).map(([k, v]) => (
              <div key={k}><div className="flex justify-between text-sm"><span>{dimensionLabels[k]}</span><span>{Math.round(v * 100)}%</span></div>
                <input type="range" min={0} max={50} value={Math.round(v * 100)} aria-label={dimensionLabels[k]} className="w-full accent-[var(--pf-primary)]" onChange={(e) => setW({ ...w, [k]: Number(e.target.value) / 100 })} /></div>
            ))}
            <Field label="Change note" htmlFor="sn"><Input id="sn" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why are you changing the weights?" /></Field>
            <div className="flex justify-end"><Button disabled={Math.abs(total - 1) > 0.001} loading={save.isPending} onClick={() => save.mutate()}>Publish new version</Button></div>
          </CardBody></Card>
        <Card><CardHeader title="Version history" /><CardBody>
          <QueryState q={q}>{(list) => <ul className="space-y-2 text-sm">{list.map((v) => <li key={v.id} className="rounded-xl border border-line p-3"><div className="flex justify-between"><strong>v{v.version}</strong>{v.is_active && <Badge tone="success">active</Badge>}</div><div className="text-xs text-subtle">{fmtDateTime(v.created_at)} · {v.note}</div>
            <div className="mt-1 flex flex-wrap gap-1">{Object.entries(v.weights as Record<string, number>).map(([k, x]) => <Badge key={k}>{dimensionLabels[k]?.split(" ")[0]} {Math.round(x * 100)}%</Badge>)}</div></li>)}</ul>}</QueryState>
        </CardBody></Card>
      </div>
    </>
  );
}

export function AiSettings() {
  const status = useQuery({ queryKey: ["ai-status"], queryFn: () => api.ai.status() });
  const setting = useQuery({ queryKey: ["setting-ai"], queryFn: () => api.admin.setting("ai") });
  const usage = useQuery({ queryKey: ["ai-usage"], queryFn: () => api.admin.aiUsage(30) });
  const [v, setV] = useState<{ enabled: boolean; model: string; max_tokens: number } | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (setting.data && !v) setV({ enabled: setting.data.value.enabled !== false, model: (setting.data.value.model as string) ?? status.data?.model ?? "claude-opus-5-5", max_tokens: (setting.data.value.max_tokens as number) ?? 4000 }); }, [setting.data, status.data, v]);
  const save = useMutation({ mutationFn: () => api.admin.setSetting("ai", { ...v, provider: "anthropic" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-status"] }); toast.success("AI settings saved"); }, onError: (e) => toast.error(e) });
  return (
    <>
      <PageHeader title="AI provider settings" subtitle="API keys live only in server environment variables and are never shown here." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Configuration" subtitle={status.data ? `Currently: ${status.data.llm_enabled ? `LLM (${status.data.model})` : "deterministic engine only"}` : ""} />
          <CardBody className="space-y-4">{v && <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />Enable LLM features (falls back to the rule-based engine when off or unavailable)</label>
            <Field label="Model" htmlFor="am"><Select id="am" value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })}><option value="claude-opus-5-5">claude-opus-5-5</option><option value="claude-sonnet-5-5">claude-sonnet-5-5</option><option value="claude-haiku-5-5">claude-haiku-5-5</option></Select></Field>
            <Field label="Max output tokens" htmlFor="at"><Input id="at" type="number" value={v.max_tokens} onChange={(e) => setV({ ...v, max_tokens: Number(e.target.value) })} /></Field>
            <div className="flex justify-end"><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></div></>}
          </CardBody></Card>
        <Card><CardHeader title="Usage (30 days)" subtitle="Token counts only - prompts and responses are not stored" /><CardBody>
          <QueryState q={usage}>{(u) => <Table rows={u.rows} rowKey={(r) => r.feature + r.status} columns={[
            { key: "f", header: "Feature", render: (r) => r.feature }, { key: "s", header: "Status", render: (r) => <Badge tone={r.status === "ok" ? "success" : "neutral"}>{r.status}</Badge> },
            { key: "n", header: "Requests", render: (r) => r.requests }, { key: "t", header: "Tokens in/out", render: (r) => `${r.input_tokens}/${r.output_tokens}` }, { key: "l", header: "Avg ms", render: (r) => r.avg_latency_ms },
          ]} />}</QueryState>
        </CardBody></Card>
      </div>
    </>
  );
}

export function FeatureFlags() {
  const q = useQuery({ queryKey: ["flags"], queryFn: () => api.admin.flags() });
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: (f: { key: string; enabled: boolean; description: string | null }) => api.admin.setFlag(f.key, f.enabled, f.description), onSuccess: () => qc.invalidateQueries({ queryKey: ["flags"] }) });
  return (
    <>
      <PageHeader title="Feature flags" />
      <QueryState q={q}>{(list) => <Card className="divide-y divide-line">{list.map((f) => (
        <label key={f.key} className="flex items-center justify-between px-5 py-4"><div><div className="font-mono text-sm">{f.key}</div><div className="text-xs text-subtle">{f.description}</div></div>
          <input type="checkbox" className="size-5 accent-[var(--pf-primary)]" checked={f.enabled} onChange={(e) => m.mutate({ ...f, enabled: e.target.checked })} /></label>))}</Card>}</QueryState>
    </>
  );
}

export function Security() {
  const [cat, setCat] = useState<"security" | "admin" | "data" | "all">("security");
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["audit", cat, page], queryFn: () => api.admin.auditLogs({ category: cat === "all" ? undefined : cat, page, page_size: 25 }) });
  return (
    <>
      <PageHeader title="Audit & security logs" />
      <Tabs value={cat} onChange={(c) => { setCat(c); setPage(1); }} tabs={[{ key: "security", label: "Security" }, { key: "admin", label: "Admin" }, { key: "data", label: "Data" }, { key: "all", label: "All" }]} />
      <div className="mt-4"><QueryState q={q}>{(d) => (<><Table rows={d.items} rowKey={(r) => r.id} columns={[
        { key: "t", header: "Time", render: (r) => fmtDateTime(r.created_at) }, { key: "a", header: "Action", render: (r) => <code className="text-xs">{r.action}</code> },
        { key: "u", header: "Actor", render: (r) => r.actor ?? "-" }, { key: "e", header: "Entity", render: (r) => r.entity_type ? `${r.entity_type}` : "-" },
        { key: "ip", header: "IP", render: (r) => r.ip_address ?? "-" }, { key: "d", header: "Details", render: (r) => <span className="text-xs text-subtle">{JSON.stringify(r.details).slice(0, 80)}</span> },
      ]} /><Pagination page={page} pageSize={25} total={d.total} onPage={setPage} /></>)}</QueryState></div>
    </>
  );
}

export function SystemMonitor() {
  const q = useQuery({ queryKey: ["system"], queryFn: () => api.admin.system(), refetchInterval: 30000 });
  return (
    <>
      <PageHeader title="System monitoring" />
      <QueryState q={q}>{(s) => {
        const db = s.database as { ok: boolean; dialect: string; migration: string | null };
        return (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-5"><div className="text-sm text-subtle">Database</div><div className="mt-1 text-xl font-bold">{db.ok ? "Healthy" : "Unavailable"}</div><div className="text-xs text-subtle">{db.dialect} · migration {db.migration}</div></Card>
            <Card className="p-5"><div className="text-sm text-subtle">Rate limiter</div><div className="mt-1 text-xl font-bold capitalize">{s.rate_limiter as string}</div></Card>
            <Card className="p-5"><div className="text-sm text-subtle">Environment</div><div className="mt-1 text-xl font-bold capitalize">{s.environment as string}</div><div className="text-xs text-subtle">Python {s.python as string} · AI {s.ai_provider as string}</div></Card>
          </div>
        );
      }}</QueryState>
    </>
  );
}
