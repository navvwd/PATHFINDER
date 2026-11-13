import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, ShieldCheck, Sparkles } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui";
import { DomainOrbs, Streaks } from "./art";
import { StaggerText } from "./parts";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const visualY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const wordX = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "-18%"]);
  const cardsY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);

  return (
    <section id="top" ref={ref} className="relative overflow-hidden pt-28 sm:pt-32">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.15fr_1fr]">
        {/* copy */}
        <div className="relative z-10">
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-sm text-subtle">
            <span aria-hidden className="inline-block size-2 rotate-45 rounded-[2px] bg-[var(--pf-primary)]" />
            Discover Interests. Explore Possibilities. Develop Potential.
          </motion.p>
          <h1 className="mt-5 font-display text-[clamp(2.5rem,5.2vw,4.6rem)] font-medium leading-[0.98] tracking-[-0.04em] text-ink">
            <StaggerText text="Your potential is bigger than your marks." accent={["bigger"]} />
          </h1>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="mt-6 max-w-md text-lg text-subtle">
            Discover what interests you, explore what you can do, and build the skills that shape your future.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75 }} className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/register"><Button size="lg" variant="accent" className="pl-6 pr-2">Start Discovering
              <span className="ml-2 flex size-8 items-center justify-center rounded-full bg-[#171717] text-[var(--pf-primary)]"><ArrowUpRight className="size-4" /></span></Button></Link>
            <a href="#platform"><Button size="lg" variant="secondary" icon={<ArrowDownRight className="size-4" />}>Explore the Platform</Button></a>
          </motion.div>
        </div>

        {/* cinematic visual */}
        <motion.div style={{ y: visualY }} className="relative h-[360px] sm:h-[440px]">
          <div className="absolute inset-[6%] overflow-hidden rounded-[40px] bg-[#1a1a1a]">
            <Streaks />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,77,36,.35),transparent_60%)]" />
          </div>
          <DomainOrbs className="absolute inset-[4%] origin-center scale-[0.72] sm:scale-100" />

          {/* floating cards */}
          <motion.div style={{ y: cardsY }} className="absolute -right-1 top-6 hidden w-56 sm:block">
            <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 }}
              className="rounded-3xl border border-line bg-surface/90 p-4 shadow-2xl backdrop-blur">
              <p className="flex items-center gap-1.5 text-xs text-subtle"><Sparkles className="size-3.5 text-[var(--pf-primary)]" />Interest you chose</p>
              <p className="mt-1 font-display text-lg text-ink">Creative Arts & Design</p>
              <div className="mt-3 flex gap-1">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= 4 ? "bg-[var(--pf-primary)]" : "bg-muted"}`} />)}</div>
            </motion.div>
          </motion.div>
          <motion.div style={{ y: cardsY }} className="absolute -left-2 bottom-10 hidden w-52 sm:block">
            <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.05 }}
              className="rounded-3xl border border-line bg-surface/90 p-4 shadow-2xl backdrop-blur">
              <p className="text-xs text-subtle">Evidence confidence</p>
              <p className="num mt-1 text-2xl text-ink">Growing</p>
              <p className="mt-1 text-xs text-subtle">8 reviewed activities</p>
            </motion.div>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
            className="absolute bottom-0 right-6 flex items-center gap-2 rounded-full bg-inverse px-4 py-2 text-xs text-on-inverse shadow-xl">
            <ShieldCheck className="size-4 text-[var(--pf-primary)]" />No rankings · Private by default
          </motion.div>
        </motion.div>
      </div>

      {/* oversized typography across the lower hero */}
      <div aria-hidden className="relative mt-6 overflow-hidden sm:-mt-4">
        <motion.p style={{ x: wordX }} className="select-none whitespace-nowrap font-display text-[clamp(6rem,22vw,20rem)] font-light leading-[0.8] tracking-[-0.06em] text-ink/[0.07]">
          pathfinder<span className="text-[var(--pf-primary)]/40">.</span>discover
        </motion.p>
      </div>
    </section>
  );
}
