import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Sparkles, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Badge, Button, Card, CardBody, CardHeader, cx, PageHeader, QueryState, Tabs, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

type Sel = { domain_id: string; subdomain_id: string | null; strength: number; is_favourite: boolean };

export function Interests() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: "choose" | "quiz" | "evolution" = raw === "quiz" || raw === "evolution" ? raw : "choose";
  const setTab = (t: "choose" | "quiz" | "evolution") => setParams(t === "choose" ? {} : { tab: t }, { replace: true });
  return (
    <>
      <PageHeader title="Interest discovery" subtitle="Your interests are your choice. They're kept separate from scores - liking something is enough reason to explore it." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "choose", label: "My interests" }, { key: "quiz", label: "Discovery questionnaire" }, { key: "evolution", label: "Interest evolution" }]} />
      <div className="mt-6">{tab === "choose" ? <Chooser /> : tab === "quiz" ? <Questionnaire onApplied={() => setTab("choose")} /> : <Evolution />}</div>
    </>
  );
}

function Chooser() {
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const current = useQuery({ queryKey: ["interests"], queryFn: () => api.interests.list() });
  const [sel, setSel] = useState<Sel[] | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => { if (current.data && sel === null) setSel(current.data.map((i) => ({ domain_id: i.domain_id, subdomain_id: i.subdomain_id ?? null, strength: i.strength, is_favourite: i.is_favourite }))); }, [current.data, sel]);
  const save = useMutation({
    mutationFn: () => api.interests.update(sel ?? []),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["interests"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success("Interests saved - change them whenever you like"); },
    onError: (e) => toast.error(e),
  });
  const s = sel ?? [];
  const dom = (id: string) => s.find((x) => x.domain_id === id && !x.subdomain_id);
  const toggleDomain = (id: string) => setSel(dom(id) ? s.filter((x) => x.domain_id !== id) : [...s, { domain_id: id, subdomain_id: null, strength: 3, is_favourite: false }]);
  const setStrength = (id: string, strength: number) => setSel(s.map((x) => (x.domain_id === id && !x.subdomain_id ? { ...x, strength } : x)));
  const setFav = (id: string) => setSel(s.map((x) => (!x.subdomain_id ? { ...x, is_favourite: x.domain_id === id } : x)));
  const toggleSub = (domainId: string, subId: string) => {
    const has = s.some((x) => x.subdomain_id === subId);
    setSel(has ? s.filter((x) => x.subdomain_id !== subId) : [...(dom(domainId) ? s : [...s, { domain_id: domainId, subdomain_id: null, strength: 3, is_favourite: false }]), { domain_id: domainId, subdomain_id: subId, strength: 3, is_favourite: false }]);
  };
  return (
    <QueryState q={domains}>
      {(list) => (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {list.map((d) => {
              const on = dom(d.id);
              return (
                <Card key={d.id} className={cx("p-5 transition", on && "ring-2 ring-primary")}>
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => toggleDomain(d.id)} aria-pressed={!!on} className="text-left">
                      <div className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: d.color }} /><span className="font-semibold">{d.name}</span></div>
                      <p className="mt-1 text-sm text-subtle">{d.tagline}</p>
                    </button>
                    {on && <button aria-label="Favourite" onClick={() => setFav(d.id)}><Star className={cx("size-5", on.is_favourite ? "fill-accent text-accent" : "text-subtle")} /></button>}
                  </div>
                  {on && (
                    <>
                      <div className="mt-4 flex items-center gap-2 text-sm">
                        <span className="text-subtle">How much?</span>
                        {[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`Interest level ${n}`} onClick={() => setStrength(d.id, n)} className={cx("size-7 rounded-full text-xs", n <= on.strength ? "bg-inverse text-on-inverse" : "bg-muted")}>{n}</button>)}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {d.subdomains.map((sd) => {
                          const picked = s.some((x) => x.subdomain_id === sd.id);
                          return <button key={sd.id} aria-pressed={picked} onClick={() => toggleSub(d.id, sd.id)} className={cx("rounded-full border px-2.5 py-0.5 text-xs", picked ? "border-inverse bg-inverse text-on-inverse" : "border-line text-subtle")}>{sd.name}</button>;
                        })}
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
          <div className="sticky bottom-4 mt-6 flex justify-end"><Button size="lg" loading={save.isPending} onClick={() => save.mutate()}>Save my interests</Button></div>
        </>
      )}
    </QueryState>
  );
}

function Questionnaire({ onApplied }: { onApplied: () => void }) {
  const q = useQuery({ queryKey: ["questionnaire"], queryFn: () => api.interests.questionnaire() });
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.interests.submitQuestionnaire>> | null>(null);
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const current = useQuery({ queryKey: ["interests"], queryFn: () => api.interests.list() });
  const toast = useToast();
  const qc = useQueryClient();
  const submit = useMutation({ mutationFn: () => api.interests.submitQuestionnaire(Object.entries(answers).map(([question_id, option_ids]) => ({ question_id, option_ids }))), onSuccess: setResult, onError: (e) => toast.error(e) });
  const apply = async (domainId: string, strength: number) => {
    const existing = (current.data ?? []).map((i) => ({ domain_id: i.domain_id, subdomain_id: i.subdomain_id ?? null, strength: i.strength, is_favourite: i.is_favourite }));
    if (existing.some((x) => x.domain_id === domainId && !x.subdomain_id)) return toast.info("Already one of your interests");
    await api.interests.update([...existing, { domain_id: domainId, subdomain_id: null, strength, is_favourite: false }]);
    qc.invalidateQueries({ queryKey: ["interests"] });
    toast.success("Added to your interests");
  };
  if (result) return (
    <Card><CardHeader title="Your suggestions" subtitle={result.note} />
      <CardBody className="space-y-3">
        {result.suggestions.map((s) => {
          const d = domains.data?.find((x) => x.id === s.domain_id);
          return <div key={s.domain_id} className="flex items-center justify-between rounded-xl bg-muted p-3"><span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: d?.color }} />{d?.name}<Badge>{s.votes} match(es)</Badge></span><Button size="sm" variant="soft" onClick={() => apply(s.domain_id, s.suggested_strength)}>Add as interest</Button></div>;
        })}
        <div className="flex gap-2 pt-2"><Button variant="secondary" onClick={() => { setResult(null); setAnswers({}); }}>Retake</Button><Button onClick={onApplied}>Review my interests</Button></div>
      </CardBody>
    </Card>
  );
  return (
    <QueryState q={q}>
      {(data) => (
        <div className="space-y-4">
          {data.questions.map((qu) => (
            <Card key={qu.id} className="p-5">
              <h3 className="font-semibold">{qu.prompt}</h3><p className="text-xs text-subtle">Pick all that apply</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {qu.options.map((o) => {
                  const on = answers[qu.id]?.includes(o.id);
                  return <button key={o.id} aria-pressed={on} onClick={() => setAnswers({ ...answers, [qu.id]: on ? answers[qu.id]!.filter((x) => x !== o.id) : [...(answers[qu.id] ?? []), o.id] })}
                    className={cx("rounded-xl border p-3 text-left text-sm", on ? "border-primary bg-primary-soft text-primary-ink" : "border-line hover:bg-muted")}>{o.label}</button>;
                })}
              </div>
            </Card>
          ))}
          <div className="flex justify-end"><Button icon={<Sparkles className="size-4" />} disabled={!Object.values(answers).some((a) => a.length)} loading={submit.isPending} onClick={() => submit.mutate()}>See suggestions</Button></div>
        </div>
      )}
    </QueryState>
  );
}

function Evolution() {
  const q = useQuery({ queryKey: ["evolution"], queryFn: () => api.interests.evolution() });
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const name = (id?: string | null) => domains.data?.find((d) => d.id === id)?.name ?? "";
  const verb: Record<string, string> = { added: "Added", removed: "Removed", strength_changed: "Changed interest level for", favourited: "Favourited", unfavourited: "Unfavourited", explored: "Explored", questionnaire: "Took the discovery questionnaire" };
  return (
    <QueryState q={q}>
      {(e) => (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card><CardHeader title="Where you started" /><CardBody className="flex flex-wrap gap-2">{e.initial_domain_ids.map((d) => <Badge key={d}>{name(d)}</Badge>)}{!e.initial_domain_ids.length && <span className="text-sm text-subtle">-</span>}</CardBody></Card>
          <Card><CardHeader title="Now" /><CardBody className="flex flex-wrap gap-2">{e.current.filter((c) => !c.subdomain_id).map((c) => <Badge key={c.domain_id} tone="primary">{name(c.domain_id)}{c.is_favourite ? " ★" : ""}</Badge>)}</CardBody></Card>
          <Card><CardHeader title="Discoveries" subtitle={`${e.change_count} change(s) so far`} /><CardBody className="flex flex-wrap gap-2">{e.new_discoveries.map((d) => <Badge key={d.at} tone="success">{name(d.domain_id)}</Badge>)}{!e.new_discoveries.length && <span className="text-sm text-subtle">Open a new domain to discover it.</span>}</CardBody></Card>
          <Card className="lg:col-span-3"><CardHeader title="Timeline" /><CardBody>
            <ol className="relative space-y-3 border-l border-line pl-5">
              {[...e.timeline].reverse().slice(0, 40).map((h) => (
                <li key={h.id} className="text-sm"><span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-primary" />
                  <History className="mr-1 inline size-3.5 text-subtle" />{verb[h.action] ?? h.action} <strong>{name(h.domain_id)}</strong>{h.action === "strength_changed" && ` (${(h.old_value as { strength?: number })?.strength} → ${(h.new_value as { strength?: number })?.strength})`}
                  <span className="ml-2 text-xs text-subtle">{fmtDate(h.created_at)}</span></li>
              ))}
            </ol>
          </CardBody></Card>
        </div>
      )}
    </QueryState>
  );
}
