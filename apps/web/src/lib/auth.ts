import { PathfinderApi } from "@pathfinder/api-client";
import type { Me } from "@pathfinder/shared-types";
import { create } from "zustand";

/**
 * Access token lives only in memory (never localStorage) - XSS can't persist it.
 * The refresh token is an httpOnly, SameSite=Strict cookie set by the API.
 */
type AuthState = {
  accessToken: string | null;
  me: Me | null;
  status: "unknown" | "authenticated" | "anonymous";
  setToken: (t: string | null) => void;
  setMe: (me: Me | null) => void;
  reset: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  accessToken: null,
  me: null,
  status: "unknown",
  setToken: (accessToken) => set({ accessToken }),
  setMe: (me) => set({ me, status: me ? "authenticated" : "anonymous" }),
  reset: () => set({ accessToken: null, me: null, status: "anonymous" }),
}));

export const api = new PathfinderApi({
  baseUrl: (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1",
  mode: "web",
  getAccessToken: () => useAuth.getState().accessToken,
  setAccessToken: (t) => useAuth.getState().setToken(t),
  onSessionExpired: () => useAuth.getState().reset(),
});

/** Restore a session on page load using the refresh cookie. */
export async function bootstrapSession(): Promise<void> {
  const ok = await api.refresh();
  if (!ok) return useAuth.getState().setMe(null);
  try {
    useAuth.getState().setMe(await api.auth.me());
  } catch {
    useAuth.getState().reset();
  }
}

export async function signIn(identifier: string, password: string, remember = true): Promise<Me> {
  await api.auth.login(identifier, password, remember);
  const me = await api.auth.me();
  useAuth.getState().setMe(me);
  return me;
}

export async function signOut(): Promise<void> {
  try { await api.auth.logout(); } finally { useAuth.getState().reset(); }
}

export function homeFor(me: Me): string {
  switch (me.user.role) {
    case "student": return me.onboarding_complete ? "/app" : "/app/onboarding";
    case "guardian": return "/parent";
    case "mentor":
    case "teacher": return "/mentor";
    case "institution_admin": return "/institution";
    default: return "/admin";
  }
}

export const can = (me: Me | null, permission: string) => !!me?.permissions.includes(permission);
