/* Shared building blocks for the marketing site. */
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/** Fades/slides children in when they enter the viewport. */
export function Reveal({ children, delay = 0, className, y = 24 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

/** Word-by-word staggered headline reveal. */
export function StaggerText({ text, className, accent = [] }: { text: string; className?: string; accent?: string[] }) {
  const reduce = useReducedMotion();
  return (
    <span className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span className={cx("inline-block", accent.includes(w.replace(/[.,]/g, "")) && "text-[var(--pf-primary)]")}
            initial={reduce ? false : { y: "105%" }} animate={{ y: 0 }} transition={{ duration: 0.8, delay: 0.1 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}>
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cx("flex items-center gap-2 text-sm font-medium text-primary-ink", className)}>
    <span aria-hidden className="inline-block size-2 rotate-45 rounded-[2px] bg-[var(--pf-primary)]" />{children}
  </p>
);

export const Section = ({ id, children, className }: { id?: string; children: ReactNode; className?: string }) => (
  <section id={id} className={cx("scroll-mt-24", className)}>{children}</section>
);
