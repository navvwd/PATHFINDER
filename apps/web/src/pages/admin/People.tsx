import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Minus, Search, Shuffle, Users } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, cx, EmptyState, Field, Input, PageHeader, QueryState, Select, useToast } from "@/components/ui";
import { api } from "@/lib/auth";
import { titleCase } from "@/lib/format";

const ROLE_ORDER = ["student", "guardian", "teacher", "mentor", "institution_admin", "platform_admin", "super_admin"];
const ROLE_LABEL: Record<string, string> = {
  student: "Student", guardian: "Guardian", teacher: "Teacher", mentor: "Mentor",
  institution_admin: "Inst. admin", platform_admin: "Platform admin", super_admin: "Super admin",
};

/** Read-only role -> permission matrix, straight from the API's enforcement rules. */
export function RolesPermissions() {
  const q = useQuery({ queryKey: ["admin-roles"], queryFn: () => api.admin.roles() });
  const [filter, setFilter] = useState("");
  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="Permissions are enforced by the API on every request. Change a person's role in Users." />
      <QueryState q={q}>
        {(d) => {
          const roles = ROLE_ORDER.map((r) => d.roles.find((x) => x.role === r)).filter(Boolean) as typeof d.roles;
          const has = new Map(roles.map((r) => [r.role, new Set(r.permissions)]));
          const groups = new Map<string, string[]>();
          for (const p of d.permissions.filter((p) => p.includes(filter.toLowerCase()))) {
            const g = p.split(":")[0]!;
            groups.set(g, [...(groups.get(g) ?? []), p]);
          }
          return (
            <Card>
              <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
                <div className="relative w-full max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                  <Input aria-label="Filter permissions" className="pl-9" placeholder="Filter permissions" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
                <div className="flex flex-wrap gap-2 text-xs text-subtle">{roles.map((r) => <span key={r.role} className="rounded-full bg-muted px-2.5 py-1"><strong className="text-ink">{ROLE_LABEL[r.role]}</strong> {r.permissions.length}</span>)}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-line text-left text-xs text-subtle">
                      <th scope="col" className="px-4 py-2.5 font-medium">Permission</th>
                      {roles.map((r) => <th key={r.role} scope="col" className="px-2 py-2.5 text-center font-medium">{ROLE_LABEL[r.role]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...groups.entries()].map(([g, perms]) => (
                      <Fragment key={g}>
                        <tr className="bg-muted/60"><th colSpan={roles.length + 1} scope="rowgroup" className="eyebrow px-4 py-1.5 text-left text-subtle">{titleCase(g)}</th></tr>
                        {perms.map((p) => (
                          <tr key={p} className="border-b border-line last:border-0">
                            <th scope="row" className="px-4 py-2 text-left font-normal"><code className="text-xs">{p}</code></th>
                            {roles.map((r) => {
                              const ok = has.get(r.role)?.has(p);
                              return <td key={r.role} className="px-2 py-2 text-center">
                                {ok ? <Check className="mx-auto size-4 text-primary-ink" aria-label="Granted" /> : <Minus className="mx-auto size-4 text-line" aria-label="Not granted" />}
                              </td>;
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        }}
      </QueryState>
    </>
  );
}

/** Assign students to a mentor (creates a batch) within one institution. */
export function Allocation() {
  const inst = useQuery({ queryKey: ["institutions-all"], queryFn: () => api.institutions.list({ page_size: 100 }) });
  const [instId, setInstId] = useState("");
  const current = instId || inst.data?.items[0]?.id || "";
  const staff = useQuery({ queryKey: ["staff", current], enabled: !!current, queryFn: () => api.institutions.staff(current) });
  const [onlyFree, setOnlyFree] = useState(true);
  const [search, setSearch] = useState("");
  const students = useQuery({ queryKey: ["alloc-students", current, onlyFree, search], enabled: !!current,
    queryFn: () => api.students.list({ institution_id: current, unallocated: onlyFree, q: search || undefined, page_size: 100 }) });
  const [mentor, setMentor] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [batch, setBatch] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const mentors = useMemo(() => (staff.data ?? []).filter((s) => s.is_active && ["mentor", "teacher"].includes(s.role)), [staff.data]);
  const chosen = mentor || mentors[0]?.mentor_id || "";
  const allocate = useMutation({
    mutationFn: () => api.institutions.allocate(current, { mentor_id: chosen, student_ids: picked, batch_name: batch.trim() || `Group ${new Date().toLocaleDateString()}` }),
    onSuccess: (r) => { toast.success(`${r.students} student(s) allocated`); setPicked([]); setBatch(""); qc.invalidateQueries({ queryKey: ["alloc-students"] }); qc.invalidateQueries({ queryKey: ["staff"] }); qc.invalidateQueries({ queryKey: ["admin-overview"] }); },
    onError: (e) => toast.error(e),
  });
  return (
    <>
      <PageHeader title="Mentor Allocation" subtitle="Assign students to a mentor. Each allocation creates a batch the mentor can manage." />
      <div className="mb-4 max-w-sm">
        <Select aria-label="Institution" value={current} onChange={(e) => { setInstId(e.target.value); setPicked([]); setMentor(""); }}>
          {inst.data?.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Mentors & teachers" subtitle="Current load" />
          <CardBody className="p-0">
            <QueryState q={staff} isEmpty={() => !mentors.length} empty={<div className="p-5"><EmptyState title="No mentors in this institution" /></div>}>
              {() => (
                <ul className="divide-y divide-line">
                  {mentors.map((m) => (
                    <li key={m.mentor_id}>
                      <label className={cx("flex cursor-pointer items-center gap-3 px-5 py-3 text-sm hover:bg-muted", chosen === m.mentor_id && "bg-primary-soft/60")}>
                        <input type="radio" name="mentor" className="size-4 accent-[var(--pf-primary)]" checked={chosen === m.mentor_id} onChange={() => setMentor(m.mentor_id)} />
                        <span className="flex-1"><span className="font-medium">{m.full_name}</span><span className="block text-xs text-subtle">{titleCase(m.role)} · {m.email}</span></span>
                        <Badge><span className="inline-flex items-center gap-1"><Users className="size-3" />{m.students}</span></Badge>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </QueryState>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Students" subtitle={`${picked.length} selected`} action={
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--pf-primary)]" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} />Only without a mentor</label>} />
          <CardBody className="space-y-3">
            <Input aria-label="Search students" placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
            <QueryState q={students} isEmpty={(d) => !d.items.length} empty={<EmptyState title={onlyFree ? "Every student has a mentor" : "No students found"} body={onlyFree ? "Untick the filter to re-allocate existing students." : undefined} />}>
              {(d) => (
                <div className="max-h-80 overflow-y-auto rounded-xl border border-line">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-surface text-left text-xs text-subtle"><tr className="border-b border-line">
                      <th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Select all" className="size-4 accent-[var(--pf-primary)]" checked={d.items.length > 0 && d.items.every((s) => picked.includes(s.id))}
                        onChange={(e) => setPicked(e.target.checked ? d.items.map((s) => s.id) : [])} /></th>
                      <th className="px-2 py-2 font-medium">Name</th><th className="px-2 py-2 font-medium">Age group</th><th className="px-2 py-2 font-medium">Grade</th></tr></thead>
                    <tbody>{d.items.map((s) => (
                      <tr key={s.id} className="border-b border-line last:border-0 hover:bg-muted">
                        <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${s.full_name}`} className="size-4 accent-[var(--pf-primary)]" checked={picked.includes(s.id)}
                          onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} /></td>
                        <td className="px-2 py-2">{s.full_name}</td><td className="px-2 py-2 text-subtle">{s.age_group ?? "-"}</td><td className="px-2 py-2 text-subtle">{s.grade ?? "-"}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              )}
            </QueryState>
            <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-end">
              <div className="flex-1"><Field label="Batch name" htmlFor="bn"><Input id="bn" value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="e.g. Grade 7 Explorers" maxLength={120} /></Field></div>
              <Button icon={<Shuffle className="size-4" />} disabled={!picked.length || !chosen} loading={allocate.isPending} onClick={() => allocate.mutate()}>Allocate {picked.length || ""}</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
