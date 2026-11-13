import { cx } from "./ui";

/** Edutainal Ventures mark + product name. `tone="light"` for blue/dark backgrounds. */
export function BrandMark({ tone = "default", size = "md", className }: { tone?: "default" | "light"; size?: "sm" | "md" | "lg"; className?: string }) {
  const h = size === "sm" ? "h-6" : size === "lg" ? "h-9" : "h-7";
  return (
    <span className={cx("flex items-center gap-2.5", className)}>
      <img src="/brand/ev-mark.png" alt="Edutainal Ventures" className={cx(h, "w-auto")} />
      <span className={cx("font-display font-semibold tracking-tight", size === "lg" ? "text-xl" : "text-lg", tone === "light" ? "text-white" : "text-ink")}>
        PathFinder <span className={tone === "light" ? "text-white/80" : "text-primary"}>AI</span>
      </span>
    </span>
  );
}

/** Full Edutainal Ventures lockup (mark + wordmark). Use `tone="light"` on dark backgrounds. */
export function BrandLockup({ tone = "default", className }: { tone?: "default" | "light"; className?: string }) {
  return <img src={tone === "light" ? "/brand/ev-lockup-white.png" : "/brand/ev-lockup-navy.png"} alt="Edutainal Ventures" className={cx("h-12 w-auto", className)} />;
}
