import { create } from "zustand";

type Theme = "light" | "dark" | "system";

const read = (): Theme => {
  try {
    const t = localStorage.getItem("pf-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
};

export const useTheme = create<{ theme: Theme; setTheme: (t: Theme) => void }>((set) => ({
  theme: read(),
  setTheme: (theme) => {
    try { theme === "system" ? localStorage.removeItem("pf-theme") : localStorage.setItem("pf-theme", theme); } catch { /* storage blocked */ }
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    set({ theme });
  },
}));
