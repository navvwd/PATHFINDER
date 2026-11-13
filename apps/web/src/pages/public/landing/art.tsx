/* Abstract, code-drawn visuals for the marketing site (no stock imagery). */
import { motion, useReducedMotion } from "framer-motion";
import { cx } from "@/components/ui";

/** Glossy orange-red capsule used inline in headlines, as in editorial layouts. */
export function Capsule({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx("relative mx-[0.15em] inline-block h-[0.62em] w-[1.6em] translate-y-[-0.04em] overflow-hidden rounded-full align-middle", className)}
      style={{ background: "radial-gradient(120% 140% at 30% 20%, #ffb199 0%, #ff4d24 38%, #c3200b 78%, #6d0d02 100%)", boxShadow: "inset 0 -6px 12px rgba(0,0,0,.25), 0 8px 20px rgba(233,56,34,.35)" }}>
      <span className="absolute left-[12%] top-[14%] h-[30%] w-[46%] rounded-full bg-white/50 blur-[2px]" />
    </span>
  );
}

/** Motion-blur light streaks - the "kinetic" energy of the hero. */
export function Streaks({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const bars = [
    { top: "18%", w: "70%", left: "8%", c: "#ff4d24", o: 0.9, h: 22 },
    { top: "34%", w: "84%", left: "2%", c: "#ff7a45", o: 0.7, h: 40 },
    { top: "50%", w: "62%", left: "22%", c: "#e93822", o: 0.85, h: 28 },
    { top: "63%", w: "76%", left: "6%", c: "#ffb36b", o: 0.55, h: 18 },
    { top: "74%", w: "54%", left: "30%", c: "#c3200b", o: 0.75, h: 34 },
  ];
  return (
    <div aria-hidden className={cx("pointer-events-none absolute inset-0", className)}>
      {bars.map((b, i) => (
        <motion.div key={i} className="absolute rounded-full"
          style={{ top: b.top, left: b.left, width: b.w, height: b.h, background: `linear-gradient(90deg, transparent, ${b.c} 35%, ${b.c} 70%, transparent)`, opacity: b.o, filter: "blur(14px)" }}
          animate={reduce ? undefined : { x: ["-4%", "4%", "-4%"] }}
          transition={{ duration: 6 + i, repeat: Infinity, ease: "easeInOut" }} />
      ))}
    </div>
  );
}

/** Six-domain glyph cluster: abstract 3D-ish orbs, one per domain. */
export function DomainOrbs({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const orbs = [
    { x: 18, y: 22, s: 120, g: ["#2b2b2b", "#0d0d0d"], label: "STEM", icon: "grid" },
    { x: 62, y: 10, s: 92, g: ["#ffd2c2", "#ff7a45"], label: "Arts", icon: "blob" },
    { x: 70, y: 52, s: 132, g: ["#ff6a45", "#b81c06"], label: "Science", icon: "orbit" },
    { x: 34, y: 60, s: 104, g: ["#f2f2f0", "#cfcfcb"], label: "Business", icon: "bars" },
    { x: 6, y: 64, s: 72, g: ["#3a3a3a", "#171717"], label: "Speech", icon: "waves" },
    { x: 50, y: 34, s: 64, g: ["#ffe7dd", "#ffb199"], label: "Sport", icon: "track" },
  ];
  return (
    <div aria-hidden className={className ?? "relative h-full w-full"}>
      {orbs.map((o, i) => (
        <motion.div key={o.label} className="absolute flex items-center justify-center rounded-full shadow-2xl"
          style={{ left: `${o.x}%`, top: `${o.y}%`, width: o.s, height: o.s,
            background: `radial-gradient(circle at 30% 25%, ${o.g[0]}, ${o.g[1]} 72%)`, boxShadow: "0 30px 60px -20px rgba(23,23,23,.45), inset 0 -10px 24px rgba(0,0,0,.25)" }}
          initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25 + i * 0.08, type: "spring", stiffness: 120, damping: 14 }}>
          <motion.div animate={reduce ? undefined : { y: [0, -8, 0] }} transition={{ duration: 4 + i * 0.6, repeat: Infinity, ease: "easeInOut" }}>
            <Glyph kind={o.icon} light={i === 0 || i === 4} />
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}

function Glyph({ kind, light }: { kind: string; light?: boolean }) {
  const c = light ? "rgba(255,255,255,.85)" : "rgba(23,23,23,.75)";
  const common = { width: 34, height: 34, viewBox: "0 0 34 34", fill: "none", stroke: c, strokeWidth: 2, strokeLinecap: "round" as const };
  switch (kind) {
    case "grid": return <svg {...common}><rect x="5" y="5" width="9" height="9" rx="2" /><rect x="20" y="5" width="9" height="9" rx="2" /><rect x="5" y="20" width="9" height="9" rx="2" /><path d="M24.5 20v9M20 24.5h9" /></svg>;
    case "blob": return <svg {...common}><path d="M7 21c0-8 6-14 13-12s9 9 5 14-12 7-15 4" /><circle cx="15" cy="16" r="2" fill={c} /></svg>;
    case "orbit": return <svg {...common}><circle cx="17" cy="17" r="3" fill={c} /><ellipse cx="17" cy="17" rx="13" ry="5" /><ellipse cx="17" cy="17" rx="13" ry="5" transform="rotate(60 17 17)" /></svg>;
    case "bars": return <svg {...common}><path d="M7 27V19M14 27V13M21 27V16M28 27V7" /></svg>;
    case "waves": return <svg {...common}><path d="M8 17a4 4 0 0 1 4-4M6 22a9 9 0 0 1 0-10M28 12a9 9 0 0 1 0 10M22 13a4 4 0 0 1 0 8" /></svg>;
    default: return <svg {...common}><path d="M5 22c6-1 9-9 14-9s6 5 10 4" /><path d="M5 27h24" /></svg>;
  }
}

/** Per-domain abstract artwork for domain cards. */
export function DomainArt({ slug, className }: { slug: string; className?: string }) {
  const base = cx("absolute inset-0 transition-transform duration-700 group-hover:scale-110", className);
  switch (slug) {
    case "stem":
      return <div aria-hidden className={base} style={{ background: "#141414" }}>
        <svg className="absolute inset-0 h-full w-full opacity-60" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
          {Array.from({ length: 9 }).map((_, i) => <path key={i} d={`M0 ${20 + i * 20} H${60 + (i % 3) * 30} V${40 + i * 15} H200`} stroke="#ff4d24" strokeOpacity={0.15 + (i % 4) * 0.12} fill="none" />)}
          {Array.from({ length: 12 }).map((_, i) => <circle key={i} cx={(i * 37) % 200} cy={(i * 53) % 200} r="2.5" fill="#ff7a45" />)}
        </svg>
        <div className="absolute -right-10 -top-10 size-48 rounded-full bg-[#ff4d24] opacity-40 blur-3xl" />
      </div>;
    case "creative-arts":
      return <div aria-hidden className={base} style={{ background: "linear-gradient(160deg,#ffe2d6,#ffb199 45%,#ff4d24)" }}>
        <div className="absolute left-[10%] top-[18%] size-40 rounded-[42%_58%_63%_37%/40%_45%_55%_60%] bg-white/50 blur-sm" />
        <div className="absolute bottom-[8%] right-[6%] size-32 rounded-[60%_40%_30%_70%/60%_30%_70%_40%] bg-[#c3200b]/60 blur-[2px]" />
      </div>;
    case "business":
      return <div aria-hidden className={base} style={{ background: "#eeeeec" }}>
        <div className="absolute inset-x-8 bottom-0 flex h-[70%] items-end gap-3">
          {[30, 48, 40, 66, 58, 86].map((h, i) => <div key={i} className="flex-1 rounded-t-xl" style={{ height: `${h}%`, background: i === 5 ? "#ff4d24" : "#d4d4d0" }} />)}
        </div>
      </div>;
    case "communication":
      return <div aria-hidden className={base} style={{ background: "#1c1c1c" }}>
        {[1, 2, 3, 4].map((r) => <div key={r} className="absolute left-1/2 top-1/2 rounded-full border border-white/15" style={{ width: r * 70, height: r * 70, transform: "translate(-50%,-50%)" }} />)}
        <div className="absolute left-1/2 top-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: "radial-gradient(circle at 30% 25%,#ffb199,#ff4d24 60%,#a51a05)" }} />
      </div>;
    case "science":
      return <div aria-hidden className={base} style={{ background: "radial-gradient(circle at 70% 30%,#ffd2c2,#f7f7f5 60%)" }}>
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">
          {[0, 60, 120].map((r) => <ellipse key={r} cx="148" cy="58" rx="56" ry="18" fill="none" stroke="#171717" strokeOpacity=".22" transform={`rotate(${r} 148 58)`} />)}
          <circle cx="148" cy="58" r="10" fill="#ff4d24" />
        </svg>
      </div>;
    default:
      return <div aria-hidden className={base} style={{ background: "linear-gradient(120deg,#171717,#3a1a12)" }}>
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="absolute h-3 rounded-full" style={{ top: `${22 + i * 14}%`, left: `${-10 + i * 6}%`, width: `${60 + i * 8}%`, background: "linear-gradient(90deg,transparent,#ff4d24,transparent)", filter: "blur(6px)", opacity: 0.4 + i * 0.12 }} />)}
      </div>;
  }
}
