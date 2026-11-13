import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Award, BarChart3, Bell, BookOpen, Bot, Briefcase, Building2, CalendarCheck, ChevronDown, ClipboardCheck, Compass, Flag, GraduationCap,
  History, Home, Inbox, KeyRound, Layers, Lightbulb, ListChecks, Zap, LogOut, Map, Megaphone, Menu, MessageSquare, Moon, Route as RouteIcon,
  ScrollText, Server, Settings, Shield, Shuffle, Sparkles, Sun, TrendingUp, UserRound, Users, Video, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { api, homeFor, signOut, useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Avatar, cx, PageSkeleton } from "./ui";
import { BrandMark } from "./brand";

type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean };
type NavSection = { label?: string; items: NavItem[]; collapsible?: boolean };
const I = (C: typeof Home) => <C className="size-[18px]" aria-hidden />;

const STUDENT: NavSection[] = [
  { items: [
    { to: "/app", label: "Home", icon: I(Home), end: true },
    { to: "/app/courses", label: "My Courses", icon: I(BookOpen) },
    { to: "/app/tasks", label: "My Tasks", icon: I(ListChecks) },
    { to: "/app/sessions", label: "Live Sessions", icon: I(Video) },
    { to: "/app/progress", label: "My Progress", icon: I(TrendingUp) },
    { to: "/app/achievements", label: "Achievements", icon: I(Award) },
    { to: "/app/messages", label: "Messages", icon: I(MessageSquare) },
    { to: "/app/profile", label: "My Profile", icon: I(UserRound) },
  ] },
  { label: "Explore & grow", collapsible: true, items: [
    { to: "/app/domains", label: "Explore Domains", icon: I(Compass) },
    { to: "/app/interests", label: "My Interests", icon: I(Sparkles), end: true },
    { to: "/app/interests?tab=quiz", label: "Interest Discovery", icon: I(Lightbulb) },
    { to: "/app/activities", label: "Activity Library", icon: I(Layers) },
    { to: "/app/assessments", label: "Assessments", icon: I(ClipboardCheck) },
    { to: "/app/challenges", label: "Challenges", icon: I(Zap) },
    { to: "/app/skills", label: "My Skills", icon: I(BarChart3) },
    { to: "/app/timeline", label: "Growth Timeline", icon: I(History) },
    { to: "/app/insights", label: "AI Insights", icon: I(Bot) },
    { to: "/app/roadmap", label: "Personal Roadmap", icon: I(Map) },
    { to: "/app/portfolio", label: "Portfolio", icon: I(Briefcase) },
  ] },
];

const GUARDIAN: NavSection[] = [{ items: [
  { to: "/parent", label: "My Children", icon: I(Users), end: true },
  { to: "/parent/messages", label: "Messages", icon: I(MessageSquare) },
  { to: "/notifications", label: "Notifications", icon: I(Bell) },
] }];

const MENTOR: NavSection[] = [
  { items: [
    { to: "/mentor", label: "Overview", icon: I(Home), end: true },
    { to: "/mentor/students", label: "My Students", icon: I(GraduationCap) },
    { to: "/mentor/sessions", label: "Sessions & Attendance", icon: I(CalendarCheck) },
    { to: "/mentor/reviews", label: "Review & Feedback", icon: I(Inbox) },
    { to: "/mentor/messages", label: "Messages", icon: I(MessageSquare) },
  ] },
  { label: "Manage", items: [
    { to: "/mentor/batches", label: "Batches", icon: I(Users) },
    { to: "/mentor/activities", label: "Tasks & Activities", icon: I(Layers) },
    { to: "/mentor/assessments", label: "Assessments", icon: I(ClipboardCheck) },
  ] },
];

const INSTITUTION: NavSection[] = [
  { items: [
    { to: "/institution", label: "Overview", icon: I(BarChart3), end: true },
    { to: "/institution/structure", label: "Campuses & Classes", icon: I(Building2) },
    { to: "/institution/people", label: "Staff & Students", icon: I(Users) },
    { to: "/institution/reports", label: "Reports", icon: I(ScrollText) },
  ] },
  { label: "Teaching", items: [
    { to: "/mentor/students", label: "Student Profiles", icon: I(GraduationCap) },
    { to: "/mentor/sessions", label: "Sessions & Attendance", icon: I(CalendarCheck) },
    { to: "/mentor/activities", label: "Activities", icon: I(Layers) },
    { to: "/mentor/reviews", label: "Review Queue", icon: I(Inbox) },
  ] },
];

const ADMIN_CORE: NavSection[] = [
  { items: [{ to: "/admin", label: "Overview", icon: I(BarChart3), end: true }] },
  { label: "People", items: [
    { to: "/admin/users", label: "Users", icon: I(Users) },
    { to: "/admin/roles", label: "Roles & Permissions", icon: I(KeyRound) },
    { to: "/admin/allocation", label: "Mentor Allocation", icon: I(Shuffle) },
    { to: "/admin/institutions", label: "Institutions", icon: I(Building2) },
  ] },
  { label: "Content", items: [
    { to: "/admin/domains", label: "Domains", icon: I(Compass) },
    { to: "/mentor/activities", label: "Activities", icon: I(Layers) },
    { to: "/mentor/assessments", label: "Assessments", icon: I(ClipboardCheck) },
    { to: "/admin/notifications", label: "Announcements", icon: I(Megaphone) },
  ] },
];
const SUPER_EXTRA: NavSection = { label: "System", items: [
  { to: "/admin/security", label: "Activity Logs", icon: I(Shield) },
  { to: "/admin/scoring", label: "Scoring Config", icon: I(RouteIcon) },
  { to: "/admin/ai", label: "AI Settings", icon: I(Bot) },
  { to: "/admin/flags", label: "Feature Flags", icon: I(Flag) },
  { to: "/admin/system", label: "System Health", icon: I(Server) },
] };

/** Items sharing a path (e.g. /app/interests and /app/interests?tab=quiz) are told apart by their query. */
function queryMatches(to: string, search: string, nav: NavItem[]): boolean {
  const [path, query] = to.split("?");
  if (query) return new URLSearchParams(search).toString().includes(query);
  const siblings = nav.filter((n) => n.to.startsWith(`${path}?`));
  return !siblings.some((n) => new URLSearchParams(search).toString().includes(n.to.split("?")[1]!));
}

function navFor(role: string): NavSection[] {
  if (role === "student") return STUDENT;
  if (role === "guardian") return GUARDIAN;
  if (role === "mentor" || role === "teacher") return MENTOR;
  if (role === "institution_admin") return INSTITUTION;
  if (role === "super_admin") return [...ADMIN_CORE, SUPER_EXTRA];
  return ADMIN_CORE;
}

export function RequireAuth({ roles, children }: { roles?: string[]; children?: ReactNode }) {
  const { status, me } = useAuth();
  const loc = useLocation();
  if (status === "unknown") return <div className="p-8"><PageSkeleton /></div>;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (roles && !roles.includes(me.user.role)) return <Navigate to={homeFor(me)} replace />;
  if (me.user.role === "student" && !me.onboarding_complete && !loc.pathname.startsWith("/app/onboarding") && !loc.pathname.startsWith("/app/settings"))
    return <Navigate to="/app/onboarding" replace />;
  return <>{children ?? <Outlet />}</>;
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  return (
    <button onClick={() => setTheme(dark ? "light" : "dark")} aria-label="Toggle colour theme" className="rounded-xl p-2 text-subtle hover:bg-muted hover:text-ink">
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}

export function AppShell() {
  const me = useAuth((s) => s.me)!;
  const loc = useLocation();
  const reduce = useReducedMotion();
  const nav = navFor(me.user.role);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const unread = useQuery({ queryKey: ["unread"], queryFn: () => api.notifications.unread(), refetchInterval: 60_000 });
  const experience = me.ui_mode === "junior" ? "junior" : me.ui_mode;
  const settingsPath = me.user.role === "student" ? "/app/settings" : "/settings";
  const notifPath = me.user.role === "student" ? "/app/notifications" : "/notifications";

  const flat = nav.flatMap((sec) => sec.items);
  const link = (n: NavItem) => (
    <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
      className={({ isActive }) => cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
        isActive && queryMatches(n.to, loc.search, flat) ? "bg-primary-soft text-primary-ink" : "text-subtle hover:bg-muted hover:text-ink")}>
      {n.icon}{n.label}
    </NavLink>
  );
  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <NavLink to={homeFor(me)} className="mb-4 flex items-center gap-2 px-2 py-1" onClick={() => setOpen(false)}>
        <BrandMark />
      </NavLink>
      {nav.map((sec, k) => sec.collapsible ? (
        <details key={k} className="group mt-3" open={sec.items.some((n) => loc.pathname.startsWith(n.to.split("?")[0]!)) || undefined}>
          <summary className="eyebrow flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-1.5 text-subtle hover:text-ink">
            {sec.label}<ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
          </summary>
          <div className="mt-1 space-y-1">{sec.items.map(link)}</div>
        </details>
      ) : (
        <div key={k} className={cx("space-y-1", k > 0 && "mt-3")}>
          {sec.label && <div className="eyebrow px-3 py-1.5 text-subtle">{sec.label}</div>}
          {sec.items.map(link)}
        </div>
      ))}
      <div className="mt-auto space-y-1 border-t border-line pt-3">
        <NavLink to={settingsPath} onClick={() => setOpen(false)} className={({ isActive }) => cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-muted hover:text-ink", isActive ? "text-ink" : "text-subtle")}>
          {I(Settings)}Settings
        </NavLink>
        <button onClick={async () => { await signOut(); navigate("/login"); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-subtle hover:bg-muted hover:text-ink">
          {I(LogOut)}Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div data-experience={experience} className="min-h-full lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden lg:block sticky top-0 h-screen border-r border-line bg-surface">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute left-0 top-0 h-full w-72 bg-surface" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-3 p-2" aria-label="Close menu" onClick={() => setOpen(false)}><X className="size-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6">
          <button className="lg:hidden rounded-xl p-2 hover:bg-muted" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="size-5" /></button>
          <div className="flex-1" />
          <ThemeToggle />
          <NavLink to={notifPath} aria-label="Notifications" className="relative rounded-xl p-2 text-subtle hover:bg-muted hover:text-ink">
            <Bell className="size-5" />
            {!!unread.data?.count && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-[#171717]">{unread.data.count}</span>}
          </NavLink>
          <div className="flex items-center gap-2">
            <Avatar name={me.user.full_name} />
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-medium">{me.user.full_name}</div>
              <div className="text-xs text-subtle capitalize">{me.user.role.replace("_", " ")}</div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <motion.div key={loc.pathname} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
