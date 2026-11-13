import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { academicSchema, type AcademicInput } from "@pathfinder/validation";
import { motion } from "framer-motion";
import { Check, Copy, Star } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { Button, Card, cx, Field, Input, PageHeader, ProgressBar, QueryState, Textarea, TagInput, useToast } from "@/components/ui";
import { api, useAuth } from "@/lib/auth";

const STEP_KEYS = ["academic", "interests", "goals", "guardian"] as const;
type StepKey = (typeof STEP_KEYS)[number];

export function Onboarding() {
  const status = useQuery({ queryKey: ["onboarding"], queryFn: () => api.students.onboarding() });
  const student = useQuery({ queryKey: ["student-me"], queryFn: () => api.students.me() });
  const [step, setStep] = useState<StepKey | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const complete = useMutation({
    mutationFn: () => api.students.completeOnboarding(),
    onSuccess: async () => {
      useAuth.getState().setMe(await api.auth.me());
      toast.success("You're all set - welcome aboard!");
      navigate("/app", { replace: true });
    },
    onError: (e) => toast.error(e),
  });
  const advance = () => { qc.invalidateQueries({ queryKey: ["onboarding"] }); qc.invalidateQueries({ queryKey: ["student-me"] }); };

  return (
    <QueryState q={status}>
      {(s) => {
        const current = step ?? STEP_KEYS.find((k) => !s.steps.find((x) => x.key === k)?.completed) ?? "guardian";
        const idx = STEP_KEYS.indexOf(current);
        return (
          <div className="mx-auto max-w-3xl">
            <PageHeader title="Let's set up your journey" subtitle="Tell us about yourself so we can suggest the right activities. You can change everything later." />
            <Card className="mb-6 p-5">
              <div className="mb-3 flex items-center justify-between text-sm"><span className="font-medium">Onboarding progress</span><span className="text-subtle">{s.percent_complete}%</span></div>
              <ProgressBar value={s.percent_complete} label="Onboarding progress" />
              <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {s.steps.map((st) => (
                  <li key={st.key}>
                    <button disabled={st.key === "account"} onClick={() => setStep(st.key as StepKey)}
                      className={cx("flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs", st.key === current ? "bg-primary-soft text-primary-ink" : "text-subtle hover:bg-muted")}>
                      <span className={cx("flex size-5 items-center justify-center rounded-full text-[10px]", st.completed ? "bg-success text-white" : "border border-line")}>{st.completed ? <Check className="size-3" /> : ""}</span>
                      {st.title}{!st.required && <span className="opacity-60">(opt)</span>}
                    </button>
                  </li>
                ))}
              </ol>
            </Card>
            <motion.div key={current} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="p-6">
                <div className="mb-4 text-sm text-subtle">Step {idx + 2} of 5</div>
                {student.data && current === "academic" && <Academic defaults={student.data} onDone={() => { advance(); setStep("interests"); }} />}
                {student.data && current === "interests" && <InterestsStep defaults={student.data} onDone={() => { advance(); setStep("goals"); }} />}
                {student.data && current === "goals" && <Goals defaults={student.data} onDone={() => { advance(); setStep("guardian"); }} />}
                {current === "guardian" && <GuardianStep status={s} onDone={advance} />}
              </Card>
            </motion.div>
            <div className="mt-6 flex justify-end">
              <Button size="lg" loading={complete.isPending} disabled={s.steps.some((x) => x.required && !x.completed)} onClick={() => complete.mutate()}>Finish onboarding</Button>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}

function Academic({ defaults, onDone }: { defaults: { school_name: string | null; grade: string | null; class_name: string | null; educational_background: string | null }; onDone: () => void }) {
  const toast = useToast();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<AcademicInput>({
    resolver: zodResolver(academicSchema),
    defaultValues: { school_name: defaults.school_name ?? "", grade: defaults.grade ?? "", class_name: defaults.class_name ?? "", educational_background: defaults.educational_background ?? "" },
  });
  return (
    <form className="space-y-4" onSubmit={handleSubmit(async (v) => { try { await api.students.saveAcademic(v); onDone(); } catch (e) { toast.error(e); } })}>
      <h2 className="text-xl font-semibold">Academic profile</h2>
      <Field label="School" htmlFor="school" error={errors.school_name?.message}><Input id="school" {...register("school_name")} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Grade" htmlFor="grade" error={errors.grade?.message}><Input id="grade" placeholder="e.g. 7" {...register("grade")} /></Field>
        <Field label="Class / section" htmlFor="class"><Input id="class" placeholder="e.g. 7B" {...register("class_name")} /></Field>
      </div>
      <Field label="Educational background (optional)" htmlFor="bg"><Textarea id="bg" placeholder="Board, languages, special programmes..." {...register("educational_background")} /></Field>
      <div className="flex justify-end"><Button type="submit" loading={isSubmitting}>Save & continue</Button></div>
    </form>
  );
}

function InterestsStep({ defaults, onDone }: { defaults: { favourite_subjects: string[]; hobbies: string[]; personal_interests: string[]; extracurriculars: string[]; self_reported_strengths: string[] }; onDone: () => void }) {
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const current = useQuery({ queryKey: ["interests"], queryFn: () => api.interests.list() });
  const toast = useToast();
  const [form, setForm] = useState({ ...defaults });
  const initialDomains = current.data?.filter((i) => !i.subdomain_id).map((i) => i.domain_id);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [subs, setSubs] = useState<string[] | null>(null);
  const [fav, setFav] = useState<string | null>(null);
  // Domains picked on the public landing page are carried over (only if nothing is saved yet).
  const [fromLanding] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("pf-preselected-domains") ?? "[]"); } catch { return []; }
  });
  const landingIds = domains.data?.filter((d) => fromLanding.includes(d.slug)).map((d) => d.id) ?? [];
  const sel = picked ?? (initialDomains?.length ? initialDomains : landingIds.length ? landingIds : initialDomains) ?? [];
  const selSubs = subs ?? current.data?.filter((i) => i.subdomain_id).map((i) => i.subdomain_id!) ?? [];
  const favourite = fav ?? current.data?.find((i) => i.is_favourite)?.domain_id ?? null;
  const [saving, setSaving] = useState(false);
  const toggle = (id: string) => setPicked(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  const save = async () => {
    setSaving(true);
    try {
      try { sessionStorage.removeItem("pf-preselected-domains"); } catch { /* ignore */ }
      await api.students.saveInterests({ ...form, domain_ids: sel, subdomain_ids: selSubs.filter((s) => domains.data?.some((d) => sel.includes(d.id) && d.subdomains.some((x) => x.id === s))), favourite_domain_id: favourite });
      onDone();
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Interest discovery</h2>
      <p className="text-sm text-subtle">Choose any domains you're curious about - there are no wrong answers, and you can change them any time.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {domains.data?.map((d) => {
          const on = sel.includes(d.id);
          return (
            <div key={d.id} className={cx("rounded-2xl border p-4 transition", on ? "border-primary bg-primary-soft/50" : "border-line")}>
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => toggle(d.id)} aria-pressed={on} className="flex-1 text-left">
                  <div className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: d.color }} /><span className="font-semibold">{d.name}</span></div>
                  <p className="mt-1 text-xs text-subtle">{d.tagline}</p>
                </button>
                {on && <button type="button" aria-label="Mark as favourite" onClick={() => setFav(d.id)}><Star className={cx("size-5", favourite === d.id ? "fill-accent text-accent" : "text-subtle")} /></button>}
              </div>
              {on && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {d.subdomains.map((s) => (
                    <button type="button" key={s.id} aria-pressed={selSubs.includes(s.id)}
                      onClick={() => setSubs(selSubs.includes(s.id) ? selSubs.filter((x) => x !== s.id) : [...selSubs, s.id])}
                      className={cx("rounded-full border px-2.5 py-0.5 text-xs", selSubs.includes(s.id) ? "border-inverse bg-inverse text-on-inverse" : "border-line text-subtle")}>{s.name}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Field label="Favourite subjects"><TagInput value={form.favourite_subjects} onChange={(v) => setForm({ ...form, favourite_subjects: v })} suggestions={["Maths", "Science", "English", "Art", "Computers", "History"]} /></Field>
      <Field label="Hobbies"><TagInput value={form.hobbies} onChange={(v) => setForm({ ...form, hobbies: v })} suggestions={["Drawing", "Football", "Reading", "Music", "Gaming", "Cooking"]} /></Field>
      <Field label="Extracurricular activities"><TagInput value={form.extracurriculars} onChange={(v) => setForm({ ...form, extracurriculars: v })} suggestions={["Debate club", "Robotics club", "Sports team", "Choir"]} /></Field>
      <Field label="Things you think you're good at"><TagInput value={form.self_reported_strengths} onChange={(v) => setForm({ ...form, self_reported_strengths: v })} suggestions={["Curious", "Creative", "Patient", "Team player", "Organised"]} /></Field>
      <div className="flex justify-end"><Button onClick={save} loading={saving} disabled={!sel.length}>Save & continue</Button></div>
    </div>
  );
}

function Goals({ defaults, onDone }: { defaults: { skills_to_learn: string[]; activities_enjoyed: string[]; aspirations: string | null; learning_preferences: string[] }; onDone: () => void }) {
  const toast = useToast();
  const [g, setG] = useState({ ...defaults, aspirations: defaults.aspirations ?? "" });
  const [saving, setSaving] = useState(false);
  const prefs = [["hands_on", "Hands-on making"], ["visual", "Videos & pictures"], ["reading", "Reading"], ["collaborative", "With friends"]] as const;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Personal goals</h2>
      <Field label="Skills you want to learn"><TagInput value={g.skills_to_learn} onChange={(v) => setG({ ...g, skills_to_learn: v })} suggestions={["Coding", "Public speaking", "Drawing", "Budgeting", "Experiments"]} /></Field>
      <Field label="Activities you enjoy"><TagInput value={g.activities_enjoyed} onChange={(v) => setG({ ...g, activities_enjoyed: v })} /></Field>
      <Field label="What would you love to achieve?" htmlFor="asp"><Textarea id="asp" value={g.aspirations} onChange={(e) => setG({ ...g, aspirations: e.target.value })} /></Field>
      <Field label="How do you like to learn?">
        <div className="flex flex-wrap gap-2">
          {prefs.map(([k, l]) => (
            <button type="button" key={k} aria-pressed={g.learning_preferences.includes(k)}
              onClick={() => setG({ ...g, learning_preferences: g.learning_preferences.includes(k) ? g.learning_preferences.filter((x) => x !== k) : [...g.learning_preferences, k] })}
              className={cx("rounded-xl border px-3 py-2 text-sm", g.learning_preferences.includes(k) ? "border-primary bg-primary-soft text-primary-ink" : "border-line")}>{l}</button>
          ))}
        </div>
      </Field>
      <div className="flex justify-end"><Button loading={saving} onClick={async () => { setSaving(true); try { await api.students.saveGoals(g); onDone(); } catch (e) { toast.error(e); } finally { setSaving(false); } }}>Save & continue</Button></div>
    </div>
  );
}

function GuardianStep({ status, onDone }: { status: { guardian_invite_code: string | null; requires_guardian_consent: boolean; consent_status: string }; onDone: () => void }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Parent / guardian verification</h2>
      {status.requires_guardian_consent ? (
        <p className="text-sm text-subtle">Because you're under 18, a parent or guardian needs to link to your account and give consent for how your data is used. Share this code with them - they enter it when they create their PathFinder account.</p>
      ) : <p className="text-sm text-subtle">You're 18 or older, so guardian linking is optional. You can still share this code if you'd like a parent to follow your progress.</p>}
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-primary bg-primary-soft/40 p-4">
        <span className="font-mono text-2xl font-bold tracking-[0.3em] text-primary-ink">{status.guardian_invite_code}</span>
        <Button size="sm" variant="secondary" icon={<Copy className="size-4" />} onClick={() => { void navigator.clipboard?.writeText(status.guardian_invite_code ?? ""); setCopied(true); }}>{copied ? "Copied" : "Copy"}</Button>
      </div>
      <p className="text-xs text-subtle">Consent status: <strong className="capitalize">{status.consent_status.replace("_", " ")}</strong></p>
      <div className="flex flex-wrap justify-end gap-2">
        {!status.requires_guardian_consent && <Button variant="secondary" onClick={async () => { try { await api.students.guardianStep("skip_adult"); onDone(); } catch (e) { toast.error(e); } }}>Skip - I'm an adult</Button>}
        <Button onClick={async () => { try { await api.students.guardianStep("invite"); onDone(); toast.success("Great - finish onboarding below."); } catch (e) { toast.error(e); } }}>I've shared the code</Button>
      </div>
    </div>
  );
}
