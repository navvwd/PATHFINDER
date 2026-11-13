import type { Me } from "@pathfinder/shared-types";
import { create } from "zustand";

type Session = {
  accessToken: string | null;
  me: Me | null;
  status: "unknown" | "authenticated" | "anonymous";
  setToken: (t: string | null) => void;
  setMe: (me: Me | null) => void;
  reset: () => void;
};

export const useSession = create<Session>((set) => ({
  accessToken: null,
  me: null,
  status: "unknown",
  setToken: (accessToken) => set({ accessToken }),
  setMe: (me) => set({ me, status: me ? "authenticated" : "anonymous" }),
  reset: () => set({ accessToken: null, me: null, status: "anonymous" }),
}));
