import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BrandMark } from "@/components/brand";
import { Button, cx } from "@/components/ui";

export const NAV_LINKS: Array<[string, string]> = [
  ["#top", "Home"], ["#discover", "Discover"], ["#domains", "Explore"], ["#how", "How It Works"], ["#about", "About"],
];

/** Floating rounded navigation; transparent over the hero, solid after scrolling. */
export function Nav() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 40));
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-3 z-50 px-3 sm:top-4 sm:px-6">
      <nav aria-label="Primary"
        className={cx("mx-auto flex max-w-6xl items-center justify-between rounded-full px-3 py-2 transition-all duration-300 sm:px-4",
          solid ? "border border-line bg-surface/85 shadow-card backdrop-blur-md" : "border border-transparent bg-transparent")}>
        <a href="#top" aria-label="PathFinder AI home"><BrandMark size="sm" /></a>
        <ul className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map(([href, label]) => (
            <li key={href}><a href={href} className="rounded-full px-3.5 py-2 text-sm text-subtle transition hover:bg-muted hover:text-ink">{label}</a></li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 lg:flex">
          <Link to="/login" className="rounded-full px-4 py-2 text-sm font-medium text-ink hover:bg-muted">Login</Link>
          <Link to="/register"><Button size="sm" variant="accent" className="h-9 px-4">Get Started</Button></Link>
        </div>
        <button className="rounded-full p-2 hover:bg-muted lg:hidden" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}><Menu className="size-5" /></button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 bg-black/30 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-3 top-3 rounded-[28px] bg-surface p-5 shadow-2xl"
              initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}>
              <div className="flex items-center justify-between"><BrandMark size="sm" />
                <button aria-label="Close menu" className="rounded-full p-2 hover:bg-muted" onClick={() => setOpen(false)}><X className="size-5" /></button></div>
              <ul className="mt-6 space-y-1">
                {NAV_LINKS.map(([href, label]) => (
                  <li key={href}><a href={href} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 font-display text-2xl text-ink hover:bg-muted">{label}</a></li>
                ))}
              </ul>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Link to="/login"><Button variant="secondary" className="w-full">Login</Button></Link>
                <Link to="/register"><Button variant="accent" className="w-full">Get Started</Button></Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
