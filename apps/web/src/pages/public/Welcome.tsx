import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight, ArrowUpRight, BarChart3, Compass, FlaskConical, HeartHandshake, Lightbulb, Megaphone, Palette, ShieldCheck,
  Sparkles, Target, Trophy, Briefcase, Cpu,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate } from "react-router";
import { Button, cx } from "@/components/ui";
import { api, homeFor, useAuth } from "@/lib/auth";

const DOMAIN_ICONS: Record<string, typeof Cpu> = {
  stem: Cpu, "creative-arts": Palette, business: Briefcase, communication: Megaphone, science: FlaskConical, sports: Trophy,
};

/* ---------------------------------------------------------------- hero visuals */

function Clouds() {
  // Layered soft ellipses - pure CSS clouds, no image assets.
  const puffs = [
    "left-[-6%] bottom-[-6%] w-[46%] h-[42%]", "left-[18%] bottom-[-10%] w-[40%] h-[36%]", "right-[-8%] bottom-[-4%] w-[48%] h-[44%]",
    "right-[22%] bottom-[-12%] w-[38%] h-[34%]", "left-[38%] bottom-[-14%] w-[34%] h-[30%]", "left-[-10%] top-[18%] w-[30%] h-[16%] opacity-60",
    "right-[-6%] top-[26%] w-[28%] h-[14%] opacity-50",
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {puffs.map((c) => <div key={c} className={cx("absolute rounded-[50%] bg-white/90 blur-2xl", c)} />)}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-white dark:to-[var(--pf-bg)]" />
    </div>
  );
}

const MiniCard = ({ children, className, dark }: { children: ReactNode; className?: string; dark?: boolean }) => (
  <div className={cx("absolute w-[150px] rounded-2xl border p-3 text-left text-[11px] shadow-2xl shadow-sky-900/20 backdrop-blur sm:w-[170px]",
    dark ? "border-white/10 bg-[#0b1b33] text-white" : "border-white/60 bg-white/95 text-slate-800", className)}>
    {children}
  </div>
);

function FloatingCards() {
  // A fanned arc of real PathFinder UI fragments (static illustrations of the product).
  const spark = [38, 44, 41, 52, 58, 55, 66, 72, 70, 81];
  return (
    <div aria-hidden className="relative mx-auto mt-12 h-[230px] w-full max-w-5xl sm:h-[260px]">
      <div className="absolute inset-0">
        <MiniCard className="z-10 left-[1%] top-[64px] [transform:perspective(900px)_rotateY(34deg)_scale(.86)] hidden md:block">
          <div className="eyebrow text-[9px] text-slate-500">Weekly goal</div>
          <div className="mt-1 font-semibold">Complete 3 activities</div>
          <div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-full w-2/3 rounded-full bg-[var(--pf-primary)]" /></div>
        </MiniCard>
        <MiniCard className="z-20 left-[12%] top-[36px] [transform:perspective(900px)_rotateY(24deg)_scale(.92)] hidden sm:block">
          <div className="eyebrow text-[9px] text-slate-500">Interest vs skill</div>
          {[["STEM", 82, 90], ["Arts", 64, 71], ["Science", 70, 58]].map(([n, a, b]) => (
            <div key={n as string} className="mt-1.5"><div className="flex justify-between"><span>{n}</span><span className="text-slate-500">{b}</span></div>
              <div className="mt-0.5 flex gap-0.5"><div className="h-1.5 rounded bg-amber-400" style={{ width: `${(a as number) * 0.9}%` }} /></div>
              <div className="mt-0.5 h-1.5 rounded bg-[var(--pf-primary)]" style={{ width: `${(b as number) * 0.9}%` }} /></div>
          ))}
        </MiniCard>
        <MiniCard className="hidden sm:block z-30 left-[26%] top-[12px] [transform:perspective(900px)_rotateY(14deg)]">
          <div className="flex items-center gap-2"><span className="flex size-7 items-center justify-center rounded-full bg-sky-100 font-semibold text-sky-700">DN</span>
            <div><div className="font-semibold">Diya, 13</div><div className="text-slate-500">Level 6 · 4-day streak</div></div></div>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <div className="rounded-lg bg-slate-50 p-1.5"><div className="text-slate-500">Initial</div><div className="text-sm font-semibold">55</div></div>
            <div className="rounded-lg bg-[var(--pf-lime)] p-1.5"><div className="text-slate-700">Now</div><div className="text-sm font-semibold">82</div></div>
          </div>
        </MiniCard>
        <MiniCard className="z-40 left-1/2 top-0 -translate-x-1/2">
          <div className="eyebrow text-[9px] text-slate-500">Growth over time</div>
          <div className="mt-1 font-semibold">Improving on repeated work</div>
          <svg viewBox="0 0 100 40" className="mt-2 h-14 w-full">
            <polyline fill="none" stroke="var(--pf-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              points={spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${40 - (v / 100) * 38}`).join(" ")} />
          </svg>
        </MiniCard>
        <MiniCard dark className="hidden sm:block z-30 right-[26%] top-[12px] [transform:perspective(900px)_rotateY(-14deg)]">
          <div className="flex items-center gap-1 text-[var(--pf-lime)]"><Sparkles className="size-3" /><span className="eyebrow text-[9px]">Explainable</span></div>
          <div className="mt-1 text-sm font-semibold leading-snug">STEM looks promising</div>
          <ul className="mt-1.5 space-y-0.5 text-white/75"><li>• Skill 82/100, 14 records</li><li>• High evidence confidence</li><li>• You can disagree</li></ul>
        </MiniCard>
        <MiniCard className="z-20 right-[12%] top-[36px] [transform:perspective(900px)_rotateY(-24deg)_scale(.92)] hidden sm:block">
          <div className="flex size-8 items-center justify-center rounded-full bg-[var(--pf-primary)] text-white"><Target className="size-4" /></div>
          <div className="mt-2 font-semibold">30-day roadmap</div>
          <div className="text-slate-500">Foundations → Practice → Mini project</div>
        </MiniCard>
        <MiniCard className="z-10 right-[1%] top-[64px] [transform:perspective(900px)_rotateY(-34deg)_scale(.86)] hidden md:block">
          <div className="eyebrow text-[9px] text-slate-500">Badges</div>
          <div className="mt-1 text-xl font-semibold">11</div>
          <div className="text-slate-500">Personal milestones - no leaderboards</div>
        </MiniCard>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- page */

const Chip = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cx("mx-1 inline-flex size-[0.95em] translate-y-[0.08em] items-center justify-center rounded-full align-baseline", className)}>{children}</span>
);

export function Welcome() {
  const me = useAuth((s) => s.me);
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  if (me) return <Navigate to={homeFor(me)} replace />;
  const subdomainCount = domains.data?.reduce((n, d) => n + d.subdomains.length, 0);

  return (
    <div className="min-h-full bg-white dark:bg-[var(--pf-bg)]">
      {/* ---------------- hero ---------------- */}
      <section className="relative overflow-hidden" style={{ background: "linear-gradient(180deg, var(--pf-sky-top) 0%, #5aa8f7 38%, var(--pf-sky-bottom) 78%)" }}>
        <Clouds />
        <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-white">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="font-display text-lg font-semibold tracking-tight">PathFinder AI</span>
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
            {[["#domains", "Domains"], ["#about", "About"], ["#how", "How it works"], ["/institutions/register", "For schools"]].map(([href, label]) => (
              href.startsWith("#") ? <a key={href} href={href} className="eyebrow text-white/90 hover:text-white">{label}</a>
                : <Link key={href} to={href} className="eyebrow text-white/90 hover:text-white">{label}</Link>
            ))}
          </nav>
          <Link to="/login"><Button variant="lime" size="sm" className="eyebrow !text-[0.7rem]">Sign in</Button></Link>
        </header>

        <div className="relative z-10 mx-auto max-w-4xl px-4 pb-10 pt-12 text-center sm:pt-16">
          <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="text-4xl font-medium leading-[1.08] tracking-tight text-white sm:text-6xl">
            Discover what you love.<br /><span className="font-light text-white/90">Grow what you're good at.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mx-auto mt-5 max-w-xl text-white/85">
            PathFinder AI helps students aged 6-21 explore six domains, build real skills through hands-on work,
            and understand their own growth - with mentors and parents alongside.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register?as=guardian"><Button variant="dark" className="eyebrow !text-[0.72rem] h-11 px-5">I'm a parent</Button></Link>
            <Link to="/register">
              <Button variant="lime" className="eyebrow !text-[0.72rem] h-11 pl-5 pr-1.5">
                Get started <span className="ml-1 flex size-8 items-center justify-center rounded-full bg-[var(--pf-lime-ink)] text-[var(--pf-lime)]"><ArrowUpRight className="size-4" /></span>
              </Button>
            </Link>
          </motion.div>
        </div>
        <div className="relative z-10 px-4"><FloatingCards /></div>
        <p className="relative z-10 pb-14 pt-4 text-center text-sm text-slate-700/80 dark:text-white/60">
          Private by default · Guardian consent built in · No public rankings
        </p>
      </section>

      {/* ---------------- domain strip (logo-strip equivalent) ---------------- */}
      <section id="domains" aria-label="Six domains" className="border-y border-line/60 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4">
          {(domains.data ?? []).map((d) => {
            const Icon = DOMAIN_ICONS[d.slug] ?? Compass;
            return <span key={d.id} className="flex items-center gap-2 text-slate-400 transition hover:text-ink dark:text-slate-500"><Icon className="size-5" /><span className="font-display text-base font-semibold">{d.name.split(" & ")[0]}</span></span>;
          })}
          {domains.isLoading && <span className="skeleton h-5 w-80 rounded" />}
        </div>
      </section>

      {/* ---------------- about ---------------- */}
      <section id="about" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="eyebrow text-center text-subtle">• About PathFinder</p>
        <h2 className="mx-auto mt-4 max-w-3xl text-center text-3xl font-medium leading-tight text-ink sm:text-5xl">
          A learning companion that helps every student grow
          <Chip className="bg-[var(--pf-primary)] text-white"><Compass className="size-[0.55em]" /></Chip>
          curious <span className="text-subtle">and</span>
          <Chip className="bg-[var(--pf-lime)] text-[var(--pf-lime-ink)]"><Lightbulb className="size-[0.55em]" /></Chip>
          <span className="text-subtle">more confident</span>
        </h2>

        {/* bento */}
        <div className="mt-14 grid gap-4 md:grid-cols-4">
          <div className="relative overflow-hidden rounded-3xl bg-[var(--pf-primary)] p-6 text-white md:row-span-2">
            <BarChart3 className="absolute right-5 top-5 size-6 text-white/80" />
            <p className="eyebrow text-white/80">Compared with</p>
            <p className="mt-2 font-display text-5xl font-medium">You</p>
            <p className="mt-2 text-white/85">Improvement is measured only on repeated, comparable work - never against classmates.</p>
            <div className="mt-8 rounded-2xl bg-white p-4 text-ink">
              <div className="flex items-end justify-between"><div><div className="eyebrow text-subtle">Initial</div><div className="font-display text-3xl">55</div></div>
                <ArrowRight className="mb-2 size-5 text-subtle" />
                <div className="text-right"><div className="eyebrow text-subtle">Current</div><div className="font-display text-3xl">82</div></div></div>
              <div className="mt-3 h-2 rounded-full bg-muted"><div className="h-full w-[82%] rounded-full bg-[var(--pf-lime)]" /></div>
            </div>
          </div>
          <div className="rounded-3xl bg-muted p-6 md:col-span-2">
            <p className="text-sm text-subtle">Domains to explore</p>
            <p className="mt-1 font-display text-5xl font-medium text-ink">{domains.data?.length ?? 6}</p>
            <p className="mt-2 text-sm text-subtle">{subdomainCount ?? 48} subdomains from coding and robotics to debate, design and athletics.</p>
          </div>
          <div className="relative rounded-3xl bg-[var(--pf-lime)] p-6 text-[var(--pf-lime-ink)]">
            <p className="text-sm opacity-80">Skill dimensions</p>
            <p className="mt-1 font-display text-5xl font-medium">7</p>
            <p className="mt-2 text-sm opacity-80">Transparent, versioned weights - not an IQ score.</p>
          </div>
          <div className="rounded-3xl bg-muted p-6">
            <ShieldCheck className="size-6 text-success" />
            <p className="mt-3 font-semibold text-ink">Child data protection</p>
            <p className="mt-1 text-sm text-subtle">Guardian consent (DPDP Act), private portfolios, data export and deletion.</p>
          </div>
          <div className="rounded-3xl bg-[var(--pf-navy)] p-6 text-white dark:bg-slate-900">
            <Sparkles className="size-6 text-[var(--pf-lime)]" />
            <p className="mt-3 font-semibold">Explainable guidance</p>
            <p className="mt-1 text-sm text-white/75">Every suggestion shows its reasons and evidence. No recommendation without enough data - and students can always disagree.</p>
          </div>
          <div className="rounded-3xl border border-line p-6">
            <HeartHandshake className="size-6 text-[var(--pf-primary)]" />
            <p className="mt-3 font-semibold text-ink">Mentors & parents</p>
            <p className="mt-1 text-sm text-subtle">Rubric reviews, feedback and reports in one place.</p>
          </div>
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section id="how" className="bg-muted/60 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="eyebrow text-subtle">• How it works</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-medium text-ink sm:text-4xl">Four steps, at your own pace.</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01", "Choose", "Pick the domains you're curious about. Change your mind any time."],
              ["02", "Do", "Activities, projects and challenges matched to your age and level."],
              ["03", "Reflect", "Mentors review your work; you see exactly how each score is built."],
              ["04", "Grow", "Follow a 7 to 180-day roadmap and build a portfolio you own."],
            ].map(([n, t, b]) => (
              <li key={n} className="rounded-3xl bg-surface p-6 shadow-card">
                <span className="eyebrow text-[var(--pf-primary)]">{n}</span>
                <h3 className="mt-3 text-xl font-medium text-ink">{t}</h3>
                <p className="mt-2 text-sm text-subtle">{b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- closing CTA ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="relative overflow-hidden rounded-[2rem] px-6 py-14 text-center" style={{ background: "linear-gradient(180deg, var(--pf-sky-top), #7dbaf8)" }}>
          <h2 className="text-3xl font-medium text-white sm:text-4xl">Start exploring today.</h2>
          <p className="mx-auto mt-3 max-w-lg text-white/85">Free for students. Schools can bring whole classes with an institution code.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link to="/register"><Button variant="lime" className="eyebrow !text-[0.72rem] h-11 px-6">Create an account</Button></Link>
            <Link to="/institutions/register"><Button variant="dark" className="eyebrow !text-[0.72rem] h-11 px-6">Register a school</Button></Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-6 text-center text-sm text-subtle">PathFinder AI - an Edutainal Ventures project</footer>
    </div>
  );
}
