import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationPrefs, StudentOut } from "@pathfinder/shared-types";
import { Copy, Download, LogOut, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Badge, Button, Card, CardBody, CardHeader, cx, Field, Input, Modal, PageHeader, QueryState, TagInput, Textarea, useToast } from "@/components/ui";
import { api, signOut, useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { useTheme } from "@/lib/theme";

export function Settings() {
  const me = useAuth((s) => s.me)!;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile & settings" />
      {me.user.role === "student" && <StudentProfile />}
      <Account />
      <Appearance />
      <NotificationSettings />
      <Security />
      <Privacy />
    </div>
  );
}

function StudentProfile() {
  const q = useQuery({ queryKey: ["student-me"], queryFn: () => api.students.me() });
  const onb = useQuery({ queryKey: ["onboarding"], queryFn: () => api.students.onboarding() });
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<Partial<StudentOut> | null>(null);
  const save = useMutation({ mutationFn: () => api.students.updateMe(draft ?? {}), onSuccess: (d) => { qc.setQueryData(["student-me"], d); setDraft(null); toast.success("Profile updated"); }, onError: (e) => toast.error(e) });
  const newCode = useMutation({ mutationFn: () => api.students.newInviteCode(), onSuccess: (d) => qc.setQueryData(["onboarding"], d) });
  return (
    <QueryState q={q}>
      {(s) => {
        const v = { ...s, ...draft };
        const set = (k: keyof StudentOut, val: unknown) => setDraft({ ...draft, [k]: val });
        return (
          <Card><CardHeader title="Student profile" subtitle={`${s.age_group?.label ?? ""} · ${s.xp} XP`} />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="School" htmlFor="s1"><Input id="s1" value={v.school_name ?? ""} onChange={(e) => set("school_name", e.target.value)} /></Field>
                <Field label="Grade" htmlFor="s2"><Input id="s2" value={v.grade ?? ""} onChange={(e) => set("grade", e.target.value)} /></Field>
                <Field label="Class" htmlFor="s3"><Input id="s3" value={v.class_name ?? ""} onChange={(e) => set("class_name", e.target.value)} /></Field>
              </div>
              <Field label="Hobbies"><TagInput value={v.hobbies} onChange={(x) => set("hobbies", x)} /></Field>
              <Field label="Favourite subjects"><TagInput value={v.favourite_subjects} onChange={(x) => set("favourite_subjects", x)} /></Field>
              <Field label="Skills I want to learn"><TagInput value={v.skills_to_learn} onChange={(x) => set("skills_to_learn", x)} /></Field>
              <Field label="Aspirations" htmlFor="s4"><Textarea id="s4" value={v.aspirations ?? ""} onChange={(e) => set("aspirations", e.target.value)} /></Field>
              <div className="flex justify-end"><Button disabled={!draft} loading={save.isPending} onClick={() => save.mutate()}>Save profile</Button></div>
              <div className="rounded-2xl bg-muted p-4 text-sm">
                <div className="font-medium">Guardian invite code</div>
                <div className="mt-2 flex flex-wrap items-center gap-2"><span className="font-mono text-lg tracking-widest">{onb.data?.guardian_invite_code}</span>
                  <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={() => navigator.clipboard?.writeText(onb.data?.guardian_invite_code ?? "")}>Copy</Button>
                  <Button size="sm" variant="ghost" loading={newCode.isPending} onClick={() => newCode.mutate()}>New code</Button>
                  <Badge tone={s.consent_status === "granted" || s.consent_status === "not_required" ? "success" : "warning"}>Consent: {s.consent_status.replace("_", " ")}</Badge></div>
              </div>
            </CardBody>
          </Card>
        );
      }}
    </QueryState>
  );
}

function Account() {
  const me = useAuth((s) => s.me)!;
  const [name, setName] = useState(me.user.full_name);
  const toast = useToast();
  const save = useMutation({ mutationFn: () => api.users.updateMe({ full_name: name }), onSuccess: async () => { useAuth.getState().setMe(await api.auth.me()); toast.success("Saved"); }, onError: (e) => toast.error(e) });
  return (
    <Card><CardHeader title="Account" subtitle={me.user.email ?? me.user.phone ?? ""} />
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1"><Field label="Full name" htmlFor="fn"><Input id="fn" value={name} onChange={(e) => setName(e.target.value)} /></Field></div><Button disabled={name === me.user.full_name} loading={save.isPending} onClick={() => save.mutate()}>Save</Button></CardBody>
    </Card>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  const opts = [["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Monitor]] as const;
  return (
    <Card><CardHeader title="Appearance" /><CardBody className="flex gap-2">
      {opts.map(([k, l, I]) => <button key={k} onClick={() => setTheme(k)} aria-pressed={theme === k} className={cx("flex flex-1 items-center justify-center gap-2 rounded-xl border p-3 text-sm", theme === k ? "border-primary bg-primary-soft text-primary-ink" : "border-line")}><I className="size-4" />{l}</button>)}
    </CardBody></Card>
  );
}

function NotificationSettings() {
  const q = useQuery({ queryKey: ["prefs"], queryFn: () => api.notifications.prefs() });
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: (p: NotificationPrefs) => api.notifications.setPrefs(p), onSuccess: (d) => qc.setQueryData(["prefs"], d) });
  const labels: Record<keyof NotificationPrefs, string> = { email: "Email", push: "Push (mobile)", weekly_digest: "Weekly digest", activity_reminders: "Activity reminders & assignments", mentor_feedback: "Mentor feedback & reviews" };
  return (
    <Card><CardHeader title="Notification preferences" /><CardBody>
      <QueryState q={q}>{(p) => <div className="space-y-2">{(Object.keys(labels) as Array<keyof NotificationPrefs>).map((k) => (
        <label key={k} className="flex items-center justify-between rounded-xl p-2 hover:bg-muted"><span className="text-sm">{labels[k]}</span><input type="checkbox" className="size-5 accent-[var(--pf-primary)]" checked={!!p[k]} onChange={(e) => m.mutate({ ...p, [k]: e.target.checked })} /></label>))}</div>}</QueryState>
    </CardBody></Card>
  );
}

function Security() {
  const toast = useToast();
  const navigate = useNavigate();
  const [pw, setPw] = useState({ current: "", next: "" });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api.auth.sessions() });
  const qc = useQueryClient();
  const change = useMutation({ mutationFn: () => api.auth.changePassword(pw.current, pw.next), onSuccess: async (r) => { toast.success(r.message); await signOut(); navigate("/login"); }, onError: (e) => toast.error(e) });
  const revoke = useMutation({ mutationFn: (id: string) => api.auth.revokeSession(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }) });
  const all = useMutation({ mutationFn: () => api.auth.logoutAll(), onSuccess: async () => { await signOut(); navigate("/login"); } });
  return (
    <Card><CardHeader title="Security" /><CardBody className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Current password" htmlFor="cp"><Input id="cp" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="New password" htmlFor="np"><Input id="np" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
        <Button disabled={!pw.current || pw.next.length < 8} loading={change.isPending} onClick={() => change.mutate()}>Change</Button>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-sm font-medium">Active sessions<Button size="sm" variant="ghost" icon={<LogOut className="size-4" />} loading={all.isPending} onClick={() => all.mutate()}>Sign out everywhere</Button></div>
        <ul className="divide-y divide-line text-sm">{sessions.data?.map((s) => <li key={s.id} className="flex items-center justify-between py-2"><span><Badge>{s.client}</Badge> <span className="text-subtle">{(s.user_agent ?? "").slice(0, 60)}</span></span><span className="flex items-center gap-2 text-xs text-subtle">{fmtDateTime(s.last_used_at ?? s.created_at)}<Button size="sm" variant="ghost" onClick={() => revoke.mutate(s.id)}>Revoke</Button></span></li>)}</ul>
      </div>
    </CardBody></Card>
  );
}

function Privacy() {
  const toast = useToast();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const exp = async () => {
    try {
      const data = await api.users.exportMe();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      Object.assign(document.createElement("a"), { href: url, download: "my-pathfinder-data.json" }).click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(e); }
  };
  const del = useMutation({ mutationFn: () => api.users.deleteMe(), onSuccess: async (r) => { toast.success(r.message); useAuth.getState().reset(); navigate("/"); }, onError: (e) => toast.error(e) });
  return (
    <Card><CardHeader title="Privacy & your data" subtitle="Your rights under India's Digital Personal Data Protection Act." />
      <CardBody className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Download className="size-4" />} onClick={exp}>Download my data</Button>
        <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirm(true)}>Delete my account</Button>
        <p className="w-full text-xs text-subtle">PathFinder never uses your data to train unrelated AI models. Deleted accounts are anonymised immediately and purged after 30 days.</p>
      </CardBody>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete account?" footer={<Button variant="danger" disabled={typed !== "DELETE"} loading={del.isPending} onClick={() => del.mutate()}>Delete permanently</Button>}>
        <p className="text-sm">This signs you out everywhere and removes your profile. Type <strong>DELETE</strong> to confirm.</p>
        <Input className="mt-3" aria-label="Type DELETE" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Modal>
    </Card>
  );
}
