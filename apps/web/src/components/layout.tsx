import { useQuery } from "@tanstack/react-query";
import {
  Award, BarChart3, Bell, BookOpen, Bot, Briefcase, Building2, ClipboardCheck, Compass, Flag, FolderKanban, GraduationCap,
  Home, Inbox, Layers, LogOut, Map, Menu, MessageSquare, Moon, Route as RouteIcon, ScrollText, Settings, Shield, Sparkles,
  Sun, Target, Users, X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { api, homeFor, signOut, useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Avatar, cx, PageSkeleton } from "./ui";

type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean };
const I = (C: typeof Home) => <C className="size-[18px]" aria-hidden />;

const NAV: Record<string, NavItem[]> = {
  student: [
    { to: "/app", label: "Dashboard", icon: I(Home), end: true },
    { to: "/app/domains", label: "Six Domains", icon: I(Compass) },
    { to: "/app/interests", label: "Interest Discovery", icon: I(Sparkles) },
    { to: "/app/activities", label: "Activity Centre", icon: I(Layers) },
    { to: "/app/assessments", label: "Assessments", icon: I(ClipboardCheck) },
    { to: "/app/projects", label: "Projects", icon: I(FolderKanban) },
    { to: "/app/portfolio", label: "Portfolio", icon: I(Briefcase) },
    { to: "/app/progress", label: "Progress", icon: I(BarChart3) },
    { to: "/app/recommendations", label: "Recommendations", icon: I(Target) },
    { to: "/app/roadmap", label: "Roadmap", icon: I(Map) },
    { to: "/app/assistant", label: "AI Assistant", icon: I(Bot) },
    { to: "/app/achievements", label: "Achievements", icon: I(Award) },
  ],
  guardian: [
    { to: "/parent", label: "My Children", icon: I(Users), end: true },
    { to: "/parent/messages", label: "Messages", icon: I(MessageSquare) },
  ],
  mentor: [
    { to: "/mentor", label: "Overview", icon: I(Home), end: true },
    { to: "/mentor/students", label: "Students", icon: I(GraduationCap) },
    { to: "/mentor/reviews", label: "Review Queue", icon: I(Inbox) },
    { to: "/mentor/batches", label: "Batches", icon: I(Users) },
    { to: "/mentor/activities", label: "Activities", icon: I(Layers) },
    { to: "/mentor/assessments", label: "Assessments", icon: I(ClipboardCheck) },
    { to: "/mentor/messages", label: "Messages", icon: I(MessageSquare) },
  ],
  institution: [
    { to: "/institution", label: "Overview", icon: I(BarChart3), end: true },
    { to: "/institution/structure", label: "Campuses & Classes", icon: I(Building2) },
    { to: "/institution/people", label: "Staff & Students", icon: I(Users) },
    { to: "/institution/reports", label: "Reports", icon: I(ScrollText) },
    { to: "/mentor/students", label: "Student Profiles", icon: I(GraduationCap) },
    { to: "/mentor/activities", label: "Activities", icon: I(Layers) },
    { to: "/mentor/reviews", label: "Review Queue", icon: I(Inbox) },
  ],
  admin: [
    { to: "/admin", label: "Overview", icon: I(BarChart3), end: true },
    { to: "/admin/users", label: "Users", icon: I(Users) },
    { to: "/admin/institutions", label: "Institutions", icon: I(Building2) },
    { to: "/admin/domains", label: "Domains", icon: I(Compass) },
    { to: "/mentor/activities", label: "Activities", icon: I(Layers) },
    { to: "/mentor/assessments", label: "Assessments", icon: I(ClipboardCheck) },
    { to: "/admin/notifications", label: "Broadcast", icon: I(Bell) },
  ],
  super: [
    { to: "/admin/scoring", label: "Scoring Config", icon: I(RouteIcon) },
    { to: "/admin/ai", label: "AI Settings", icon: I(Bot) },
    { to: "/admin/flags", label: "Feature Flags", icon: I(Flag) },
    { to: "/admin/security", label: "Audit & Security", icon: I(Shield) },
    { to: "/admin/system", label: "System", icon: I(BookOpen) },
  ],
};

function navFor(role: string): NavItem[] {
  if (role === "student") return NAV.student!;
  if (role === "guardian") return NAV.guardian!;
  if (role === "mentor" || role === "teacher") return NAV.mentor!;
  if (role === "institution_admin") return NAV.institution!;
  if (role === "super_admin") return [...NAV.admin!, ...NAV.super!];
  return NAV.admin!;
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
  const nav = navFor(me.user.role);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const unread = useQuery({ queryKey: ["unread"], queryFn: () => api.notifications.unread(), refetchInterval: 60_000 });
  const experience = me.ui_mode === "junior" ? "junior" : me.ui_mode;
  const settingsPath = me.user.role === "student" ? "/app/settings" : "/settings";
  const notifPath = me.user.role === "student" ? "/app/notifications" : "/notifications";

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-3">
      <NavLink to={homeFor(me)} className="mb-4 flex items-center gap-2 px-2 py-1" onClick={() => setOpen(false)}>
        <img src="/favicon.svg" alt="" className="size-8" />
        <span className="font-display text-lg font-extrabold">PathFinder <span className="text-primary">AI</span></span>
      </NavLink>
      {nav.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
          className={({ isActive }) => cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
            isActive ? "bg-primary-soft text-primary" : "text-subtle hover:bg-muted hover:text-ink")}>
          {n.icon}{n.label}
        </NavLink>
      ))}
      <div className="mt-auto space-y-1 border-t border-line pt-3">
        <NavLink to={settingsPath} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-subtle hover:bg-muted hover:text-ink">
          {I(Settings)}Profile & Settings
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
            {!!unread.data?.count && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-danger px-1.5 text-[10px] font-bold text-white">{unread.data.count}</span>}
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
