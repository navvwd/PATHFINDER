import { cx } from "./ui";

/** Edutainal Ventures mark + PATHFINDER AI wordmark with the orange-red symbol. */
export function BrandMark({ tone = "default", size = "md", className }: { tone?: "default" | "light"; size?: "sm" | "md" | "lg"; className?: string }) {
  const h = size === "sm" ? "h-6" : size === "lg" ? "h-9" : "h-7";
  return (
    <span className={cx("flex items-center gap-2.5", className)}>
      <img src="/brand/ev-mark.png" alt="Edutainal Ventures" className={cx(h, "w-auto")} />
      <span className={cx("flex items-center gap-1.5 font-display font-semibold uppercase tracking-[0.04em]", size === "lg" ? "text-lg" : "text-[0.95rem]",
        tone === "light" ? "text-white" : "text-ink")}>
        PathFinder
        <span aria-hidden className="inline-block size-2 rotate-45 rounded-[2px] bg-[var(--pf-primary)]" />
        <span className={tone === "light" ? "text-white/70" : "text-subtle"}>AI</span>
      </span>
    </span>
  );
}

/** Full Edutainal Ventures lockup (mark + wordmark). Use `tone="light"` on dark backgrounds. */
export function BrandLockup({ tone = "default", className }: { tone?: "default" | "light"; className?: string }) {
  return <img src={tone === "light" ? "/brand/ev-lockup-white.png" : "/brand/ev-lockup-navy.png"} alt="Edutainal Ventures" className={cx("h-12 w-auto", className)} />;
}
