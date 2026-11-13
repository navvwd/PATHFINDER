import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Portfolio as PortfolioT } from "@pathfinder/shared-types";
import { Download, ExternalLink, Lock, Paperclip, Plus, Share2, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, QueryState, Select, Textarea, useToast, cx } from "@/components/ui";
import { api } from "@/lib/auth";
import { fmtDate, titleCase } from "@/lib/format";

const CATS = ["image", "video", "document", "presentation", "coding_project", "research_project", "creative_work", "certificate", "achievement"];

export function PortfolioView({ p, editable }: { p: PortfolioT; editable: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [cat, setCat] = useState("");
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const update = useMutation({ mutationFn: (b: { id: string; is_featured: boolean }) => api.portfolios.updateItem(b.id, { is_featured: b.is_featured }), onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }) });
  const remove = useMutation({ mutationFn: (id: string) => api.portfolios.deleteItem(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ["portfolio"] }); toast.success("Removed"); } });
  const items = p.items.filter((i) => !cat || i.category === cat);
  const open = async (fileId: string) => { const b = await api.files.download(fileId); window.open(URL.createObjectURL(b), "_blank", "noopener"); };
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setCat("")} className={cx("rounded-full px-3 py-1 text-sm", !cat ? "bg-inverse text-on-inverse" : "bg-muted")}>All ({p.items.length})</button>
        {CATS.filter((c) => p.items.some((i) => i.category === c)).map((c) => <button key={c} onClick={() => setCat(c)} className={cx("rounded-full px-3 py-1 text-sm", cat === c ? "bg-inverse text-on-inverse" : "bg-muted")}>{titleCase(c)}</button>)}
      </div>
      {items.length === 0 ? <EmptyState title="Nothing here yet" body="Add evaluated activities or upload your own creations." /> : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((i) => (
            <Card key={i.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-2"><Badge tone="primary">{titleCase(i.category)}</Badge>
                {editable && <div className="flex gap-1">
                  <button aria-label="Feature" onClick={() => update.mutate({ id: i.id, is_featured: !i.is_featured })}><Star className={cx("size-4", i.is_featured ? "fill-accent text-accent" : "text-subtle")} /></button>
                  <button aria-label="Remove" onClick={() => confirm("Remove this item?") && remove.mutate(i.id)}><Trash2 className="size-4 text-subtle hover:text-danger" /></button>
                </div>}
              </div>
              <h3 className="mt-3 font-semibold">{i.title}</h3>
              {i.description && <p className="mt-1 line-clamp-3 text-sm text-subtle">{i.description}</p>}
              <div className="mt-2 flex flex-wrap gap-1">{i.domain_ids.map((d) => <Badge key={d}>{domains.data?.find((x) => x.id === d)?.name}</Badge>)}</div>
              {i.mentor_feedback && <p className="mt-3 rounded-lg bg-muted p-2 text-xs">Mentor: "{i.mentor_feedback}"</p>}
              <div className="mt-auto flex items-center justify-between pt-3 text-xs text-subtle">
                <span>{fmtDate(i.created_on)}</span>
                <span className="flex gap-2">
                  {i.file_id && <button className="inline-flex items-center gap-1 text-primary-ink" onClick={() => open(i.file_id!)}><Paperclip className="size-3" />{i.file_name ?? "File"}</button>}
                  {i.external_url && <a className="inline-flex items-center gap-1 text-primary-ink" href={i.external_url} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink className="size-3" />Link</a>}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export function Portfolio() {
  const q = useQuery({ queryKey: ["portfolio"], queryFn: () => api.portfolios.get() });
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const vis = useMutation({
    mutationFn: (visibility: string) => api.portfolios.update({ visibility }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["portfolio"] }); toast.success("Sharing updated"); },
    onError: (e) => toast.error(e),
  });
  const exportJson = async () => {
    const data = await api.portfolios.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "portfolio.json" });
    a.click(); URL.revokeObjectURL(url);
  };
  return (
    <QueryState q={q}>
      {(p) => (
        <>
          <PageHeader title={p.title} subtitle="Your digital portfolio. Private by default - you decide who sees it."
            actions={<><Button variant="secondary" icon={<Download className="size-4" />} onClick={exportJson}>Export</Button><Button icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>Add item</Button></>} />
          <Card className="mb-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-sm"><Lock className="size-4" />Visibility</div>
            <Select aria-label="Visibility" className="sm:max-w-xs" value={p.visibility} onChange={(e) => vis.mutate(e.target.value)}>
              <option value="private">Only me</option><option value="guardians">Me + my guardians</option><option value="mentors">Me, guardians + mentors</option><option value="link">Anyone with link</option>
            </Select>
            {p.sharing_requires_guardian && !p.guardian_approved_sharing && <span className="text-xs text-subtle">Link sharing needs your guardian's approval.</span>}
            {p.visibility === "link" && p.share_token && (
              <Button size="sm" variant="soft" icon={<Share2 className="size-4" />} onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/p/${p.share_token}`); toast.success("Link copied"); }}>Copy share link</Button>
            )}
          </Card>
          <PortfolioView p={p} editable />
          <AddItem open={adding} onClose={() => setAdding(false)} />
        </>
      )}
    </QueryState>
  );
}

function AddItem({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const [f, setF] = useState({ title: "", description: "", category: "creative_work", domain: "", url: "" });
  const [file, setFile] = useState<File | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const fileId = file ? (await api.files.upload(file, file.name)).id : undefined;
      return api.portfolios.addItem({ title: f.title, description: f.description || undefined, category: f.category, domain_ids: f.domain ? [f.domain] : [], file_id: fileId, external_url: f.url || undefined });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["portfolio"] }); toast.success("Added to portfolio"); onClose(); setF({ title: "", description: "", category: "creative_work", domain: "", url: "" }); setFile(null); },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal open={open} onClose={onClose} title="Add portfolio item" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={f.title.length < 2} onClick={() => m.mutate()}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Title" htmlFor="pt"><Input id="pt" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Description" htmlFor="pd"><Textarea id="pd" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="pc"><Select id="pc" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select></Field>
          <Field label="Domain" htmlFor="pdm"><Select id="pdm" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })}><option value="">-</option>{domains.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        </div>
        <Field label="File (optional)" htmlFor="pf"><Input id="pf" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <Field label="Link (optional)" htmlFor="pu"><Input id="pu" type="url" placeholder="https://" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
