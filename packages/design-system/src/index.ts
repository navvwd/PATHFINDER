/**
 * PathFinder design tokens. Web consumes them via tokens.css (CSS variables, light + dark);
 * mobile consumes the same values from this module (NativeWind / StyleSheet).
 */

export const palette = {
  brand: { 50: "#fff3ef", 100: "#ffe1d7", 200: "#ffc0ad", 300: "#ff9576", 400: "#ff6a45", 500: "#ff4d24", 600: "#e93822", 700: "#c72e12", 800: "#9c2410", 900: "#5c160a" },
  neutral: { 0: "#ffffff", 50: "#f7f7f5", 100: "#eeeeec", 200: "#e5e5e3", 500: "#777777", 900: "#171717" },
  /** text-safe orange (AA on light surfaces) */
  accent: { 400: "#ff6a45", 500: "#c72e12", 600: "#9c2410" },
  success: "#15803d",
  warning: "#a16207",
  danger: "#e93822",
  info: "#3f3f3d",
} as const;

/** Canonical brand tokens (light). Same names as the CSS variables in apps/web. */
export const brand = {
  primary: "#ff4d24", primaryHover: "#e93822", secondary: "#171717", accent: "#c72e12",
  background: "#f7f7f5", surface: "#ffffff", surfaceMuted: "#eeeeec",
  textPrimary: "#171717", textSecondary: "#6b6b6b", border: "#e5e5e3",
  success: "#15803d", warning: "#a16207", danger: "#e93822",
} as const;

export const light = {
  bg: "#f7f7f5", surface: "#ffffff", surfaceMuted: "#eeeeec", border: "#e5e5e3",
  text: "#171717", textMuted: "#6b6b6b", primary: palette.brand[500], primaryText: "#ffffff",
} as const;

export const dark = {
  bg: "#121212", surface: "#1c1c1c", surfaceMuted: "#262626", border: "#2f2f2f",
  text: "#f2f2f0", textMuted: "#a3a3a0", primary: palette.brand[400], primaryText: "#171717",
} as const;

/** Domain colours (match seeded domain.color): a single brand scale, never new hues.
 *  Domains are always identified by name/icon too - colour is never the only cue. */
export const domainColors: Record<string, string> = {
  stem: "#171717",
  "creative-arts": "#ff4d24",
  business: "#c72e12",
  communication: "#6b6b6b",
  science: "#ff9576",
  sports: "#5c160a",
};

export const typography = {
  fontFamily: { sans: "'Inter', system-ui, sans-serif", display: "'Space Grotesk', 'Inter', sans-serif", mono: "'DM Mono', ui-monospace, monospace", junior: "'Nunito', 'Inter', sans-serif" },
  size: { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36 },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800 },
} as const;

export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;

/** Experience presets: younger students get larger targets, rounder shapes and playful copy. */
export const experiences = {
  junior: { radius: radius.xl, baseFont: 18, minTouch: 52, tone: "playful" },
  senior: { radius: radius.lg, baseFont: 16, minTouch: 44, tone: "focused" },
  guardian: { radius: radius.lg, baseFont: 16, minTouch: 44, tone: "reassuring" },
  admin: { radius: radius.md, baseFont: 14, minTouch: 36, tone: "dense" },
} as const;

export const confidenceStyle: Record<string, { label: string; color: string }> = {
  none: { label: "Not yet explored", color: "#d4d4d0" },
  low: { label: "Early evidence", color: "#ffb199" },
  moderate: { label: "Growing evidence", color: "#ff7a45" },
  high: { label: "Strong evidence", color: "#c72e12" },
};

export const categoryLabels: Record<string, string> = {
  knowledge_quiz: "Knowledge quiz", logical_puzzle: "Logic puzzle", creative_assignment: "Creative assignment",
  coding_challenge: "Coding challenge", science_experiment: "Science experiment", business_simulation: "Business simulation",
  public_speaking: "Public speaking", research_task: "Research task", practical_project: "Practical project", team_challenge: "Team challenge",
};

export const dimensionLabels: Record<string, string> = {
  performance: "Performance", learning_progress: "Learning progress", problem_solving: "Problem-solving",
  creativity: "Creativity", consistency: "Consistency", engagement: "Engagement", adaptability: "Adaptability",
};
