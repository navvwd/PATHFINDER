import { useQuery } from "@tanstack/react-query";
import { categoryLabels } from "@pathfinder/design-system";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight, Check, Clock, Compass, Eye, FlaskConical, Hammer, HeartHandshake, LineChart, Map, MessageSquare, ShieldCheck, Sparkles, Star, Users } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { BrandLockup, BrandMark } from "@/components/brand";
import { Button, cx } from "@/components/ui";
import { api } from "@/lib/auth";
import { Capsule, DomainArt } from "./art";
import { Eyebrow, Reveal, Section } from "./parts";

/* ---------------------------------------------------------------- 3. introduction */
export function Introduction() {
  return (
    <Section id="discover" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
      <div className="grid gap-10 lg:grid-cols-[180px_1fr]">
        <Reveal><Eyebrow>Discovery</Eyebrow></Reveal>
        <div>
          <Reveal>
            <h2 className="font-display text-[clamp(2rem,4.6vw,3.8rem)] font-medium leading-[1.05] tracking-[-0.035em] text-ink">
              Every student has something <Capsule /> worth <span className="text-[var(--pf-primary)]">discovering</span>
              <span className="text-subtle">.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-8 max-w-2xl text-xl leading-relaxed text-subtle">
              Not every strength appears in a <span className="text-ink">report card</span>. PATHFINDER helps students explore their interests,
              <span className="text-primary-ink"> experiment with new possibilities</span>, and develop skills through <span className="text-ink">real-world experiences</span>.
            </p>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- 4. domains */
const DOMAIN_COPY: Record<string, { label: string; blurb: string; dark?: boolean; tall?: boolean }> = {
  stem: { label: "Build", blurb: "Explore coding, robotics, engineering, AI, and emerging technologies.", dark: true, tall: true },
  "creative-arts": { label: "Create", blurb: "Explore graphic design, filmmaking, music, photography, animation, and creative expression." },
  business: { label: "Venture", blurb: "Explore business models, financial literacy, marketing, innovation, and entrepreneurship.", tall: true },
  communication: { label: "Lead", blurb: "Explore public speaking, collaboration, writing, debate, and leadership.", dark: true, tall: true },
  science: { label: "Investigate", blurb: "Explore scientific thinking, experimentation, environmental science, and research." },
  sports: { label: "Move", blurb: "Explore sports, fitness, coordination, discipline, and physical development.", dark: true },
};
export const PRESELECT_KEY = "pf-preselected-domains";

export function Domains() {
  const q = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  const [picked, setPicked] = useState<string[]>([]);
  const navigate = useNavigate();
  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((x) => x !== slug) : [...p, slug]));
  const start = () => {
    try { sessionStorage.setItem(PRESELECT_KEY, JSON.stringify(picked)); } catch { /* storage blocked - selection simply isn't carried over */ }
    navigate("/register");
  };
  return (
    <Section id="domains" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <Reveal>
          <Eyebrow>Six discovery domains</Eyebrow>
          <h2 className="mt-3 max-w-xl font-display text-[clamp(2rem,4vw,3.2rem)] font-medium leading-[1.05] tracking-[-0.035em] text-ink">
            Pick one. Pick all six. <span className="text-subtle">Change your mind anytime.</span></h2>
        </Reveal>
        <Reveal delay={0.1}><p className="max-w-sm text-subtle">Select the domains that spark your curiosity. Nothing here decides your future - it's where you start exploring.</p></Reveal>
      </div>

      <div className="mt-12 grid auto-rows-[260px] grid-flow-row-dense grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map((d, i) => {
          const c = DOMAIN_COPY[d.slug] ?? { label: "Explore", blurb: d.tagline ?? "" };
          const on = picked.includes(d.slug);
          return (
            <Reveal key={d.id} delay={(i % 3) * 0.08} className={cx(c.tall ? "sm:row-span-2" : "", "h-full")}>
              <article className={cx("group relative flex h-full flex-col justify-end overflow-hidden rounded-[28px] p-6 transition-shadow",
                on ? "ring-2 ring-[var(--pf-primary)] ring-offset-4 ring-offset-[var(--pf-bg)]" : "")}>
                <DomainArt slug={d.slug} />
                <div className={cx("absolute inset-0", c.dark ? "bg-gradient-to-t from-black/70 via-black/10 to-transparent" : "bg-gradient-to-t from-white/90 via-white/45 to-transparent")} />
                <span className={cx("absolute left-5 top-5 rounded-full border px-3 py-1 text-xs backdrop-blur", c.dark ? "border-white/25 text-white/85" : "border-black/10 bg-white/50 text-ink")}>{c.label}</span>
                <div className={cx("relative", c.dark ? "text-white" : "text-ink")}>
                  <h3 className="font-display text-2xl font-medium leading-tight tracking-tight sm:text-[1.7rem]">
                    <span aria-hidden className="mr-2 inline-block size-2 rotate-45 rounded-[2px] bg-[var(--pf-primary)] align-middle" />{d.name}</h3>
                  <p className={cx("mt-2 max-w-xs text-sm", c.dark ? "text-white/75" : "text-[#3d3d3d]")}>{c.blurb}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => toggle(d.slug)} aria-pressed={on}
                      className={cx("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition",
                        on ? "bg-[var(--pf-primary)] text-white" : c.dark ? "bg-white text-[#171717]" : "bg-[#171717] text-white")}>
                      {on ? <><Check className="size-4" />Selected</> : <>Select</>}
                    </button>
                    <a href="#how" className={cx("inline-flex items-center gap-1 rounded-full border px-4 py-2 text-sm", c.dark ? "border-white/30 text-white" : "border-black/15 text-ink")}>
                      Explore <ArrowUpRight className="size-3.5" /></a>
                  </div>
                </div>
              </article>
            </Reveal>
          );
        })}
        {q.isLoading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton rounded-[28px]" />)}
      </div>

      <motion.div initial={false} animate={{ y: picked.length ? 0 : 120, opacity: picked.length ? 1 : 0 }}
        className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-inverse py-2 pl-5 pr-2 text-on-inverse shadow-2xl">
          <span className="text-sm">{picked.length} domain{picked.length === 1 ? "" : "s"} selected</span>
          <Button size="sm" variant="accent" onClick={start} icon={<ArrowUpRight className="size-4" />}>Start with these</Button>
        </div>
      </motion.div>
    </Section>
  );
}

/* ---------------------------------------------------------------- 5. how it works */
const STEPS = [
  { n: "01", t: "Discover", b: "Students explore different interests and choose what they want to investigate.", i: Compass },
  { n: "02", t: "Experience", b: "Practical activities, challenges, projects and interactive experiences.", i: Hammer },
  { n: "03", t: "Understand", b: "Demonstrated skills, progress, engagement, creativity and consistency - measured from actual evidence.", i: Eye },
  { n: "04", t: "Develop", b: "Personalised roadmaps and recommendations to keep improving.", i: Map },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 60%"] });
  const line = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0, 1]);
  return (
    <Section id="how" className="mx-auto max-w-6xl px-4 py-28 sm:px-6">
      <Reveal><Eyebrow>How PathFinder works</Eyebrow>
        <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3.2rem)] font-medium tracking-[-0.035em] text-ink">Four stages. Your pace.</h2></Reveal>
      <div ref={ref} className="relative mt-16">
        {/* connecting line: horizontal on desktop, vertical on mobile */}
        <div className="absolute left-[27px] top-0 h-full w-px bg-line lg:left-0 lg:top-[27px] lg:h-px lg:w-full" />
        <motion.div style={{ scaleY: line }} className="absolute left-[27px] top-0 h-full w-px origin-top bg-[var(--pf-primary)] lg:hidden" />
        <motion.div style={{ scaleX: line }} className="absolute left-0 top-[27px] hidden h-px w-full origin-left bg-[var(--pf-primary)] lg:block" />
        <ol className="relative grid gap-12 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.12}>
              <li className="flex gap-5 lg:block">
                <span className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card"><s.i className="size-5" /></span>
                <div className="lg:mt-8">
                  <p className="num text-6xl font-light tracking-tight text-ink/15 lg:text-7xl">{s.n}</p>
                  <h3 className="-mt-3 font-display text-2xl font-medium text-ink">{s.t}</h3>
                  <p className="mt-2 max-w-xs text-sm text-subtle">{s.b}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- 6. dashboard preview */
const PREVIEW_DIMS = [
  { d: "Performance", v: 78 }, { d: "Progress", v: 84 }, { d: "Problem-solving", v: 66 }, { d: "Creativity", v: 88 },
  { d: "Consistency", v: 72 }, { d: "Engagement", v: 80 }, { d: "Adaptability", v: 61 },
];

export function DashboardPreview() {
  return (
    <Section id="platform" className="bg-[#171717] py-24 text-white sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="flex items-center gap-2 text-sm text-[#ff8a6b]"><span aria-hidden className="inline-block size-2 rotate-45 rounded-[2px] bg-[var(--pf-primary)]" />The personal growth dashboard</p>
          <h2 className="mt-3 max-w-3xl font-display text-[clamp(2rem,4.4vw,3.6rem)] font-medium leading-[1.05] tracking-[-0.035em]">
            A real platform - built around <span className="text-[#ff6a45]">your</span> next step, not your rank.</h2>
          <p className="mt-4 text-sm text-white/50">Preview with a fictional demo student. Interest, skill, progress and evidence confidence are always shown separately.</p>
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <div className="rounded-[32px] border border-white/10 bg-[#1f1f1f] p-3 shadow-2xl sm:p-5">
            <div className="grid gap-3 lg:grid-cols-12">
              {/* welcome + profile */}
              <div className="rounded-3xl bg-[#262626] p-5 lg:col-span-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-full bg-[var(--pf-primary)] font-display font-semibold">AR</span>
                  <div><p className="font-display text-lg">Good evening, Asha</p><p className="text-xs text-white/50">Age 14 · Level 6 · 5-day streak</p></div>
                </div>
                <p className="mt-5 text-xs text-white/50">Selected interests</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{["Creative Arts", "STEM", "Communication"].map((t) => <span key={t} className="rounded-full border border-white/15 px-2.5 py-1 text-xs">{t}</span>)}</div>
                <p className="mt-5 text-xs text-white/50">Exploration progress</p>
                <div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5, 6].map((i) => <span key={i} className={`h-2 flex-1 rounded-full ${i <= 4 ? "bg-[var(--pf-primary)]" : "bg-white/10"}`} />)}</div>
                <p className="mt-1 text-xs text-white/50">4 of 6 domains explored</p>
              </div>
              {/* radar */}
              <div className="rounded-3xl bg-[#262626] p-5 lg:col-span-4">
                <div className="flex items-center justify-between"><p className="font-display">Skill development · Creative Arts</p><span className="text-xs text-white/50">high evidence</span></div>
                <div className="h-[210px]" aria-label="Radar chart of seven skill dimensions" role="img">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={PREVIEW_DIMS} outerRadius="70%">
                      <PolarGrid stroke="rgba(255,255,255,.12)" />
                      <PolarAngleAxis dataKey="d" tick={{ fill: "rgba(255,255,255,.55)", fontSize: 10 }} />
                      <Radar dataKey="v" stroke="#ff4d24" fill="#ff4d24" fillOpacity={0.3} isAnimationActive />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {/* separate measurements */}
              <div className="grid grid-cols-2 gap-3 lg:col-span-4">
                {[["Interest", "85", "your choice"], ["Demonstrated skill", "78", "reviewed work"], ["Learning progress", "+14", "same tasks, over time"], ["Evidence", "High", "12 records, 3 kinds"]].map(([k, v, h]) => (
                  <div key={k} className="rounded-3xl bg-[#262626] p-4"><p className="text-xs text-white/50">{k}</p><p className="num mt-1 text-3xl">{v}</p><p className="mt-1 text-[11px] text-white/40">{h}</p></div>
                ))}
              </div>
              {/* activities */}
              <div className="rounded-3xl bg-[#262626] p-5 lg:col-span-5">
                <p className="font-display">Current activities</p>
                {[["Redesign an App Screen", "UI/UX", 60], ["Three-Minute Talk", "Public speaking", 30], ["Build a Quiz App", "Coding", 10]].map(([t, d, p]) => (
                  <div key={t as string} className="mt-4"><div className="flex justify-between text-sm"><span>{t}</span><span className="text-white/50">{d}</span></div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-white/10"><motion.div initial={{ width: 0 }} whileInView={{ width: `${p}%` }} viewport={{ once: true }} transition={{ duration: 1 }} className="h-full rounded-full bg-[var(--pf-primary)]" /></div></div>
                ))}
                <p className="mt-5 text-xs text-white/50">Completed challenges: 9 · Portfolio items: 6</p>
              </div>
              {/* growth timeline */}
              <div className="rounded-3xl bg-[#262626] p-5 lg:col-span-4">
                <p className="font-display">Growth timeline</p>
                <ol className="mt-4 space-y-3 border-l border-white/10 pl-4 text-sm">
                  {[["Nov 12", "Mentor reviewed Character Design Sheet"], ["Nov 8", "Badge: Explorer - 3 domains tried"], ["Nov 2", "Improved +18 on Design Principles Quiz"], ["Oct 27", "Added 'Poster for a Cause' to portfolio"]].map(([d, t]) => (
                    <li key={t} className="relative"><span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-[var(--pf-primary)]" /><span className="text-white/45">{d}</span> · {t}</li>))}
                </ol>
              </div>
              {/* next */}
              <div className="rounded-3xl bg-[var(--pf-primary)] p-5 lg:col-span-3">
                <Sparkles className="size-5" />
                <p className="mt-3 font-display text-lg leading-snug">Recommended next: Usability Test Report</p>
                <p className="mt-2 text-xs text-white/80">Why: strong recent UI/UX work; a level-4 practical challenge would validate it.</p>
              </div>
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.15} className="mt-8 flex flex-wrap gap-3">
          <Link to="/register"><Button size="lg" variant="accent">Create your dashboard</Button></Link>
          <Link to="/login"><Button size="lg" variant="secondary" className="!bg-transparent !text-white !border-white/25">Sign in to yours</Button></Link>
        </Reveal>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- 7. challenges */
export function Challenges() {
  const q = useQuery({ queryKey: ["featured-activities"], queryFn: () => api.activities.featured(6) });
  return (
    <Section id="challenges" className="mx-auto max-w-6xl px-4 py-28 sm:px-6">
      <Reveal>
        <Eyebrow>Practical challenges</Eyebrow>
        <h2 className="mt-3 max-w-3xl font-display text-[clamp(2rem,4.4vw,3.6rem)] font-medium leading-[1.05] tracking-[-0.035em] text-ink">
          Discover what you can do <span className="text-[var(--pf-primary)]">by doing it.</span></h2>
      </Reveal>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(q.data ?? []).map((c, i) => (
          <Reveal key={c.id} delay={(i % 3) * 0.08}>
            <motion.article whileHover={{ y: -6 }} className="group flex h-full flex-col rounded-[28px] border border-line bg-surface p-6 shadow-card">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-muted px-3 py-1 text-xs text-ink">{c.domain}</span>
                <span className="flex gap-0.5" aria-label={`Difficulty ${c.difficulty} of 5`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={cx("size-3.5", n <= c.difficulty ? "fill-[var(--pf-primary)] text-[var(--pf-primary)]" : "text-line")} />)}</span>
              </div>
              <h3 className="mt-6 font-display text-2xl font-medium leading-tight text-ink">{c.title}</h3>
              <p className="mt-2 text-sm text-subtle">{categoryLabels[c.category]} · ages {c.min_age}-{c.max_age}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">{c.skills.map((s) => <span key={s} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-subtle">{s}</span>)}</div>
              <div className="mt-auto flex items-center justify-between pt-6">
                <span className="flex items-center gap-1 text-sm text-subtle"><Clock className="size-4" />{c.estimated_minutes} min</span>
                <Link to={`/login?next=${encodeURIComponent(`/app/activities/${c.id}`)}`} className="inline-flex items-center gap-1 rounded-full bg-inverse px-4 py-2 text-sm text-on-inverse transition group-hover:bg-[var(--pf-primary)] group-hover:text-white">
                  Start challenge <ArrowUpRight className="size-4" /></Link>
              </div>
            </motion.article>
          </Reveal>
        ))}
        {q.isLoading && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-64 rounded-[28px]" />)}
        {q.error && <p className="text-subtle">Challenges are loading slowly - <Link to="/register" className="text-primary-ink underline">sign up</Link> to browse them all.</p>}
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- 8. AI insights */
const INSIGHTS = [
  ["Interest patterns", "What you choose to explore, and how that changes."],
  ["Demonstrated skills", "Scores from reviewed work - never from a single test."],
  ["Learning progress", "Improvement on repeated, comparable tasks."],
  ["Consistency", "Steady effort over weeks, not cramming."],
  ["Creativity", "Originality from rubric-rated creative work."],
  ["Problem-solving", "Approach and reasoning in puzzles and projects."],
  ["Adaptability", "How you handle harder challenges."],
];

export function Insights() {
  return (
    <Section id="about" className="bg-muted/70 py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <Reveal>
            <Eyebrow>AI-powered insights</Eyebrow>
            <h2 className="mt-3 font-display text-[clamp(2rem,4.2vw,3.4rem)] font-medium leading-[1.05] tracking-[-0.035em] text-ink">
              Your growth deserves more than a <span className="text-[var(--pf-primary)]">single score.</span></h2>
            <p className="mt-6 max-w-md text-subtle">AI helps you understand your progress - it supports exploration and never decides your future.
              Every recommendation shows the evidence behind it, and you can always disagree.</p>
          </Reveal>
          <Reveal delay={0.1}><ul className="mt-8 grid gap-2 sm:grid-cols-2">
            {INSIGHTS.map(([t, b]) => (
              <li key={t} className="rounded-2xl bg-surface p-4"><p className="flex items-center gap-2 font-medium text-ink"><span className="size-1.5 rounded-full bg-[var(--pf-primary)]" />{t}</p><p className="mt-1 text-sm text-subtle">{b}</p></li>
            ))}
          </ul></Reveal>
        </div>
        <Reveal delay={0.15} className="lg:pt-16">
          <figure className="relative rounded-[32px] bg-surface p-7 shadow-card">
            <span className="absolute -top-3 left-7 rounded-full bg-inverse px-3 py-1 text-xs text-on-inverse">Example insight · illustrative, not a real result</span>
            <Sparkles className="size-6 text-[var(--pf-primary)]" />
            <blockquote className="mt-4 font-display text-2xl leading-snug text-ink">
              "You have consistently explored creative design activities and demonstrated improvement in visual composition. Consider exploring
              <span className="text-primary-ink"> UI/UX design</span>, <span className="text-primary-ink">illustration</span>, and <span className="text-primary-ink">digital branding</span>."
            </blockquote>
            <figcaption className="mt-6 border-t border-line pt-5">
              <p className="text-sm font-medium text-ink">Evidence behind it</p>
              <ul className="mt-2 space-y-1.5 text-sm text-subtle">
                <li className="flex gap-2"><LineChart className="size-4 shrink-0 text-[var(--pf-primary)]" />6 creative activities in 8 weeks, chosen voluntarily</li>
                <li className="flex gap-2"><Star className="size-4 shrink-0 text-[var(--pf-primary)]" />Composition criterion: 62 → 84 across repeated tasks</li>
                <li className="flex gap-2"><Users className="size-4 shrink-0 text-[var(--pf-primary)]" />2 pieces validated by a mentor</li>
              </ul>
              <p className="mt-4 text-xs text-subtle">Not an intelligence score, personality profile or diagnosis.</p>
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- 9. parent + mentor */
export function Ecosystem() {
  const cards = [
    { id: "parents", title: "For parents & guardians", icon: HeartHandshake, dark: false, cta: ["Create a parent account", "/register?as=guardian"],
      items: ["Understand development progress", "View the reports your child permits", "Support exploration at home", "Manage consent and sharing permissions"] },
    { id: "mentors", title: "For mentors & teachers", icon: MessageSquare, dark: true, cta: ["Bring PathFinder to your school", "/institutions/register"],
      items: ["Review activities with clear rubrics", "Give feedback that students see", "Track progress without rankings", "Recommend practical challenges"] },
  ];
  return (
    <Section id="ecosystem" className="mx-auto max-w-6xl px-4 py-28 sm:px-6">
      <Reveal><Eyebrow>A supportive ecosystem</Eyebrow>
        <h2 className="mt-3 max-w-2xl font-display text-[clamp(2rem,4vw,3.2rem)] font-medium leading-[1.05] tracking-[-0.035em] text-ink">Everyone in a student's corner - with the right permissions.</h2></Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {cards.map((c, i) => (
          <Reveal key={c.id} delay={i * 0.1}>
            <article id={c.id} className={cx("flex h-full flex-col rounded-[32px] p-8", c.dark ? "bg-[#171717] text-white" : "border border-line bg-surface text-ink")}>
              <c.icon className="size-7 text-[var(--pf-primary)]" />
              <h3 className="mt-6 font-display text-3xl font-medium">{c.title}</h3>
              <ul className="mt-6 space-y-3">{c.items.map((t) => <li key={t} className="flex items-start gap-3"><Check className="mt-0.5 size-4 shrink-0 text-[var(--pf-primary)]" /><span className={c.dark ? "text-white/80" : "text-subtle"}>{t}</span></li>)}</ul>
              <Link to={c.cta[1]} className="mt-auto pt-8"><Button variant={c.dark ? "accent" : "dark"}>{c.cta[0]}</Button></Link>
            </article>
          </Reveal>
        ))}
      </div>
      <Reveal className="mt-4">
        <div className="flex flex-col items-start gap-3 rounded-[28px] border border-line bg-surface p-6 sm:flex-row sm:items-center">
          <ShieldCheck className="size-6 shrink-0 text-success" />
          <p className="text-sm text-subtle"><span className="font-medium text-ink">Child data protection by design.</span> Guardian consent for under-18s (DPDP Act), private-by-default portfolios,
            data export and deletion, and no public rankings. Student data is never used to train unrelated AI models.</p>
        </div>
      </Reveal>
    </Section>
  );
}

/* ---------------------------------------------------------------- 10. final CTA */
export function FinalCta() {
  const reduce = useReducedMotion();
  return (
    <Section className="px-3 pb-3 sm:px-6">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[40px] bg-[#171717] px-6 py-24 text-white sm:px-12 sm:py-32">
        <motion.div aria-hidden className="absolute -right-24 -top-24 size-[420px] rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle,#ff4d24,#e93822 50%,transparent 70%)" }}
          animate={reduce ? undefined : { scale: [1, 1.15, 1], opacity: [0.55, 0.8, 0.55] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
        <Reveal className="relative">
          <h2 className="max-w-4xl font-display text-[clamp(2.4rem,6vw,5.6rem)] font-medium leading-[0.98] tracking-[-0.045em]">
            Your future doesn't need to fit inside a <span className="text-[#ff6a45]">report card.</span></h2>
          <p className="mt-8 max-w-lg text-lg text-white/70">Start exploring your interests. Build real skills. Discover possibilities.</p>
          <Link to="/register" className="mt-10 inline-block"><Button size="lg" variant="accent" className="pl-6 pr-2">Begin Your Journey
            <span className="ml-2 flex size-8 items-center justify-center rounded-full bg-[#171717] text-[var(--pf-primary)]"><ArrowUpRight className="size-4" /></span></Button></Link>
        </Reveal>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- 11. footer */
export function Footer() {
  const cols: Array<[string, Array<[string, string]>]> = [
    ["Platform", [["About", "/#about"], ["Discover", "/#discover"], ["Domains", "/#domains"], ["Challenges", "/#challenges"]]],
    ["People", [["For Parents", "/#parents"], ["For Mentors", "/#mentors"], ["For Schools", "/institutions/register"]]],
    ["Company", [["Contact", "/contact"], ["Privacy Policy", "/privacy"], ["Terms and Conditions", "/terms"]]],
  ];
  return (
    <footer className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <BrandMark />
          <p className="mt-4 max-w-xs text-sm text-subtle">Discover Interests. Explore Possibilities. Develop Potential.</p>
          <BrandLockup className="mt-6 h-16 dark:hidden" /><BrandLockup tone="light" className="mt-6 hidden h-16 dark:block" />
        </div>
        {cols.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <p className="text-sm font-medium text-ink">{title}</p>
            <ul className="mt-4 space-y-2.5">{links.map(([l, h]) => <li key={l}>{h.startsWith("/#") ? <a href={h} className="text-sm text-subtle hover:text-ink">{l}</a> : <Link to={h} className="text-sm text-subtle hover:text-ink">{l}</Link>}</li>)}</ul>
          </nav>
        ))}
      </div>
      <div className="mt-12 flex flex-col justify-between gap-2 border-t border-line pt-6 text-xs text-subtle sm:flex-row">
        <span>© {new Date().getFullYear()} Edutainal Ventures. PathFinder AI.</span>
        <span className="flex items-center gap-1.5"><FlaskConical className="size-3.5" />Built for discovery, not ranking.</span>
      </div>
    </footer>
  );
}
