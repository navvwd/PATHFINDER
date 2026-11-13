import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Compass, HeartHandshake, ShieldCheck, Sparkles, Target } from "lucide-react";
import { Link, Navigate } from "react-router";
import { Button, Card } from "@/components/ui";
import { api, homeFor, useAuth } from "@/lib/auth";

const pillars = [
  { icon: Compass, title: "You choose", body: "Pick the domains you're curious about. Change your mind any time - your interests are yours." },
  { icon: Target, title: "Learn by doing", body: "Activities, projects and challenges matched to your age and level, reviewed by real mentors." },
  { icon: BarChart3, title: "See your growth", body: "Progress compares you only with your past self - never with classmates, never as an IQ score." },
  { icon: Sparkles, title: "Explainable guidance", body: "Every suggestion shows why it was made and how much evidence supports it. You can disagree." },
];

export function Welcome() {
  const me = useAuth((s) => s.me);
  const domains = useQuery({ queryKey: ["domains"], queryFn: () => api.domains.list() });
  if (me) return <Navigate to={homeFor(me)} replace />;
  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2"><img src="/favicon.svg" alt="" className="size-9" /><span className="font-display text-xl font-extrabold">PathFinder <span className="text-primary">AI</span></span></div>
        <nav className="flex items-center gap-2">
          <Link to="/login"><Button variant="ghost">Sign in</Button></Link>
          <Link to="/register"><Button>Get started</Button></Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary"><Sparkles className="size-4" /> For students aged 6-21</span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">Discover what you love.<br /><span className="text-primary">Grow</span> what you're good at.</h1>
          <p className="mt-5 max-w-xl text-lg text-subtle">PathFinder AI helps students explore six domains, build real skills through hands-on activities, and understand their own growth - with mentors and parents alongside.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/register"><Button size="lg" icon={<ArrowRight className="size-5" />}>Start exploring</Button></Link>
            <Link to="/register?as=guardian"><Button size="lg" variant="secondary" icon={<HeartHandshake className="size-5" />}>I'm a parent</Button></Link>
          </div>
          <p className="mt-4 text-sm text-subtle">Schools: <Link className="text-primary underline" to="/institutions/register">register your institution</Link></p>
        </motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 gap-3">
          {(domains.data ?? Array.from({ length: 6 }).map(() => null)).map((d, i) => (
            <Card key={d?.id ?? i} className="p-5">
              <div className="mb-3 h-2 w-10 rounded-full" style={{ background: d?.color ?? "var(--pf-border)" }} />
              <div className="font-semibold">{d?.name ?? <span className="skeleton inline-block h-4 w-32 rounded" />}</div>
              <div className="mt-1 text-sm text-subtle">{d?.tagline}</div>
            </Card>
          ))}
        </motion.div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <Card key={p.title} className="p-6">
              <p.icon className="size-6 text-primary" />
              <h3 className="mt-3 font-semibold">{p.title}</h3>
              <p className="mt-1 text-sm text-subtle">{p.body}</p>
            </Card>
          ))}
        </div>
        <Card className="mt-8 flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
          <ShieldCheck className="size-8 text-success shrink-0" />
          <p className="text-sm text-subtle"><strong className="text-ink">Child data protection by design.</strong> Guardian consent for under-18s (DPDP Act), private-by-default portfolios, no public rankings, and your data is never used to train unrelated AI models.</p>
        </Card>
      </section>
      <footer className="border-t border-line py-6 text-center text-sm text-subtle">PathFinder AI - an Edutainal Ventures project</footer>
    </div>
  );
}
