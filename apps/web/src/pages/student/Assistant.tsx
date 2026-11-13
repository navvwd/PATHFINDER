import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Send, ShieldCheck, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AiLabel, Badge, Button, Card, CardBody, CardHeader, cx, Input, PageHeader, useToast } from "@/components/ui";
import { api } from "@/lib/auth";

type Msg = { role: "user" | "assistant"; text: string; meta?: { source: string; label: string; note?: string | null }; acts?: Array<{ id: string; title: string; domain: string }> };

export function Assistant() {
  const status = useQuery({ queryKey: ["ai-status"], queryFn: () => api.ai.status() });
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", text: "Hi! I can suggest activities, explain your progress, or help you plan what to try next. What's on your mind?" }]);
  const [input, setInput] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const toast = useToast();
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);
  const send = useMutation({
    mutationFn: (m: string) => api.ai.chat(m),
    onSuccess: (r) => setMsgs((x) => [...x, { role: "assistant", text: r.data.reply, meta: r, acts: r.data.suggested_activities }]),
    onError: (e) => toast.error(e),
  });
  const insights = useMutation({ mutationFn: () => api.ai.interestAnalysis(), onError: (e) => toast.error(e) });
  const skills = useMutation({ mutationFn: () => api.ai.skillSuggestions(), onError: (e) => toast.error(e) });
  const submit = () => {
    const m = input.trim();
    if (!m || send.isPending) return;
    setMsgs((x) => [...x, { role: "user", text: m }]);
    setInput("");
    send.mutate(m);
  };
  return (
    <>
      <PageHeader title="AI Assistant" subtitle="Guidance grounded in your own activity records." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex h-[70vh] flex-col lg:col-span-2">
          <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={cx("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                <span className={cx("flex size-8 shrink-0 items-center justify-center rounded-full", m.role === "user" ? "bg-primary text-on-primary" : "bg-primary-soft text-primary-ink")}>{m.role === "user" ? <User className="size-4" /> : <Bot className="size-4" />}</span>
                <div className={cx("max-w-[80%] rounded-2xl px-4 py-3 text-sm", m.role === "user" ? "bg-primary text-on-primary" : "bg-muted")}>
                  <p className="whitespace-pre-line">{m.text}</p>
                  {m.acts && m.acts.length > 0 && <div className="mt-3 space-y-1">{m.acts.map((a) => <Link key={a.id} to={`/app/activities/${a.id}`} className="block rounded-lg bg-surface px-3 py-2 text-ink hover:opacity-80">{a.title} <span className="text-xs text-subtle">· {a.domain}</span></Link>)}</div>}
                  {m.meta && <div className="mt-2"><AiLabel {...m.meta} /></div>}
                </div>
              </div>
            ))}
            {send.isPending && <div className="text-sm text-subtle">Thinking…</div>}
            <div ref={end} />
          </div>
          <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Input aria-label="Message" placeholder="Ask about activities, projects or your progress…" value={input} maxLength={1000} onChange={(e) => setInput(e.target.value)} />
            <Button type="submit" aria-label="Send" loading={send.isPending} icon={<Send className="size-4" />} />
          </form>
        </Card>
        <div className="space-y-4">
          <Card className="p-4 text-sm"><div className="flex gap-2"><ShieldCheck className="size-5 shrink-0 text-success" /><div>
            <p>{status.data?.notice}</p>
            <p className="mt-2 text-xs text-subtle">Mode: <Badge>{status.data?.llm_enabled ? `LLM (${status.data.model})` : "Rule-based engine"}</Badge></p>
          </div></div></Card>
          <Card><CardHeader title="Interest analysis" action={<Button size="sm" variant="soft" loading={insights.isPending} onClick={() => insights.mutate()}>Run</Button>} />
            {insights.data && <CardBody className="space-y-2 text-sm"><AiLabel {...insights.data} /><p>{insights.data.data.summary}</p>
              {insights.data.data.aligned_interests.length > 0 && <p><strong>Backed by your work:</strong> {insights.data.data.aligned_interests.join(", ")}</p>}
              {insights.data.data.keep_exploring.length > 0 && <p><strong>Keep exploring:</strong> {insights.data.data.keep_exploring.join(", ")}</p>}
              {insights.data.data.worth_trying.length > 0 && <p><strong>Worth trying:</strong> {insights.data.data.worth_trying.join(", ")}</p>}</CardBody>}
          </Card>
          <Card><CardHeader title="Skill suggestions" action={<Button size="sm" variant="soft" loading={skills.isPending} onClick={() => skills.mutate()}>Run</Button>} />
            {skills.data && <CardBody className="space-y-2 text-sm"><AiLabel {...skills.data} /><ul className="list-disc pl-4">{skills.data.data.suggestions.map((s) => <li key={s}>{s}</li>)}</ul></CardBody>}
          </Card>
        </div>
      </div>
    </>
  );
}
