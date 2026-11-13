/* Reusable design-system components for the web app. */
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Inbox, Info, Loader2, RefreshCw, X } from "lucide-react";
import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { friendlyError } from "@pathfinder/api-client";
import { confidenceStyle } from "@pathfinder/design-system";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

// ---------------------------------------------------------------- Button
type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "lime" | "dark";
const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-muted",
  ghost: "text-ink hover:bg-muted",
  danger: "bg-danger text-white hover:opacity-90",
  soft: "bg-primary-soft text-primary hover:opacity-90",
  lime: "bg-lime text-lime-ink hover:bg-lime-hover shadow-sm",
  dark: "bg-navy text-surface hover:opacity-90",
};
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: ReactNode;
}>(({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={cx(
      "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
      size === "sm" ? "h-8 px-3 text-sm" : size === "lg" ? "h-12 px-6 text-base" : "h-10 px-4 text-sm",
      variants[variant], className)}
    {...rest}
  >
    {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
    {children}
  </button>
));
Button.displayName = "Button";

// ---------------------------------------------------------------- Card
export function Card({ className, children, interactive, ...rest }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div className={cx("bg-surface border border-line rounded-[var(--radius-card)] shadow-card",
      interactive && "transition hover:-translate-y-0.5 hover:shadow-lg cursor-pointer", className)} {...rest}>
      {children}
    </div>
  );
}
export const CardHeader = ({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 px-5 pt-5">
    <div><h3 className="font-semibold text-ink">{title}</h3>{subtitle && <p className="text-sm text-subtle mt-0.5">{subtitle}</p>}</div>
    {action}
  </div>
);
export const CardBody = ({ className, children }: { className?: string; children: ReactNode }) => <div className={cx("p-5", className)}>{children}</div>;

// ---------------------------------------------------------------- Form fields
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">{label}</label>
      {children}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : hint ? <p className="text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
const inputCls = "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-subtle/70 focus:border-primary focus:outline-none focus:ring-4 focus:ring-[var(--pf-ring)] disabled:opacity-60";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ className, invalid, ...rest }, ref) => <input ref={ref} aria-invalid={invalid || undefined} className={cx(inputCls, invalid && "border-danger", className)} {...rest} />);
Input.displayName = "Input";
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...rest }, ref) => <textarea ref={ref} aria-invalid={invalid || undefined} className={cx(inputCls, "min-h-28", invalid && "border-danger", className)} {...rest} />);
Textarea.displayName = "Textarea";
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...rest }, ref) => <select ref={ref} className={cx(inputCls, "pr-8", className)} {...rest}>{children}</select>);
Select.displayName = "Select";

export function TagInput({ value, onChange, placeholder, suggestions = [] }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[] }) {
  const [draft, setDraft] = useState("");
  const add = (t: string) => {
    const v = t.trim();
    if (v && !value.some((x) => x.toLowerCase() === v.toLowerCase()) && value.length < 20) onChange([...value, v]);
    setDraft("");
  };
  return (
    <div>
      <div className={cx(inputCls, "flex flex-wrap gap-1.5 min-h-11")}>
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-lg bg-primary-soft text-primary px-2 py-0.5 text-sm">
            {t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X className="size-3" /></button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={value.length ? "" : placeholder}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); } }}
          onBlur={() => draft && add(draft)} className="flex-1 min-w-24 bg-transparent outline-none text-sm" />
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.filter((s) => !value.includes(s)).map((s) => (
            <button type="button" key={s} onClick={() => add(s)} className="rounded-lg border border-dashed border-line px-2 py-0.5 text-xs text-subtle hover:border-primary hover:text-primary">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Badges, progress, stats
type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-muted text-subtle", primary: "bg-primary-soft text-primary", success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", info: "bg-primary-soft text-info",
};
export const Badge = ({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) =>
  <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;

export const ConfidenceBadge = ({ label }: { label: string }) => {
  const s = confidenceStyle[label] ?? confidenceStyle.none!;
  return <span className="inline-flex items-center gap-1.5 text-xs text-subtle"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</span>;
};

export function ProgressBar({ value, max = 100, color, label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full" style={{ background: color ?? "var(--pf-primary)" }} />
    </div>
  );
}

export const Stat = ({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between text-subtle text-sm">{label}{icon}</div>
    <div className="mt-2 text-2xl font-bold text-ink font-display">{value}</div>
    {hint && <div className="mt-1 text-xs text-subtle">{hint}</div>}
  </Card>
);

export const Avatar = ({ name, size = 36 }: { name: string; size?: number }) => (
  <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary font-semibold"
    style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
    {name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
  </span>
);

// ---------------------------------------------------------------- Page scaffolding & states
export const PageHeader = ({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) => (
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div><h1 className="text-2xl sm:text-3xl font-bold text-ink">{title}</h1>{subtitle && <p className="mt-1 text-subtle">{subtitle}</p>}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const Skeleton = ({ className }: { className?: string }) => <div className={cx("skeleton rounded-xl", className)} aria-hidden />;
export const PageSkeleton = () => (
  <div className="space-y-4" aria-busy="true" aria-label="Loading">
    <Skeleton className="h-9 w-64" /><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-64" />
  </div>
);

export const EmptyState = ({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-12 text-center">
    <div className="mb-3 rounded-2xl bg-primary-soft p-3 text-primary">{icon ?? <Inbox className="size-6" />}</div>
    <h3 className="font-semibold text-ink">{title}</h3>
    {body && <p className="mt-1 max-w-md text-sm text-subtle">{body}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => (
  <div role="alert" className="flex flex-col items-center rounded-[var(--radius-card)] border border-danger/30 bg-danger-soft px-6 py-10 text-center">
    <AlertTriangle className="size-7 text-danger" />
    <h3 className="mt-2 font-semibold text-ink">We couldn't load this</h3>
    <p className="mt-1 text-sm text-subtle">{friendlyError(error)}</p>
    {onRetry && <Button variant="secondary" className="mt-4" icon={<RefreshCw className="size-4" />} onClick={onRetry}>Try again</Button>}
  </div>
);

/** Renders loading / error / empty / content for a TanStack Query result. */
export function QueryState<T>({ q, empty, isEmpty, children, skeleton }: {
  q: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown };
  empty?: ReactNode; isEmpty?: (d: T) => boolean; children: (d: T) => ReactNode; skeleton?: ReactNode;
}) {
  if (q.isLoading) return <>{skeleton ?? <PageSkeleton />}</>;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  if (isEmpty?.(q.data) && empty) return <>{empty}</>;
  return <>{children(q.data)}</>;
}

// ---------------------------------------------------------------- Tabs
export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: Array<{ key: K; label: ReactNode }>; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}
          className={cx("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition", value === t.key ? "bg-surface text-ink shadow-sm" : "text-subtle hover:text-ink")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div role="dialog" aria-modal="true" aria-labelledby={id} onMouseDown={(e) => e.stopPropagation()}
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
            className={cx("w-full max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-surface border border-line shadow-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 id={id} className="text-lg font-semibold">{title}</h2>
              <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-muted"><X className="size-5" /></button>
            </div>
            <div className="p-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- Table
export function Table<T>({ rows, columns, rowKey, onRowClick, empty }: {
  rows: T[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: ReactNode;
  columns: Array<{ key: string; header: ReactNode; render: (r: T) => ReactNode; className?: string }>;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-subtle">
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={cx("px-4 py-3 font-medium", c.className)}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cx("border-t border-line", onRowClick && "cursor-pointer hover:bg-muted/60")}>
              {columns.map((c) => <td key={c.key} className={cx("px-4 py-3 align-middle", c.className)}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-subtle">
      <span>{total} result(s)</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span>Page {page} of {pages}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Toasts
type ToastItem = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<{ push: (kind: ToastItem["kind"], text: string) => void }>({ push: () => {} });
export const useToast = () => {
  const { push } = useContext(ToastCtx);
  return { success: (t: string) => push("success", t), error: (e: unknown) => push("error", typeof e === "string" ? e : friendlyError(e)), info: (t: string) => push("info", t) };
};
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}
              className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xl">
              {t.kind === "success" ? <CheckCircle2 className="size-5 text-success shrink-0" /> : t.kind === "error" ? <AlertTriangle className="size-5 text-danger shrink-0" /> : <Info className="size-5 text-info shrink-0" />}
              <p className="text-sm text-ink">{t.text}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const AiLabel = ({ source, label, note }: { source: string; label: string; note?: string | null }) => (
  <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
    <Badge tone={source === "ai" ? "primary" : "neutral"}>{source === "ai" ? "AI-generated" : "Rule-based"}</Badge>
    <span>{label}</span>
    {note && <span className="text-warning">{note}</span>}
  </div>
);
