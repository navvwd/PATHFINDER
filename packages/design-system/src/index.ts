/**
 * PathFinder design tokens. Web consumes them via tokens.css (CSS variables, light + dark);
 * mobile consumes the same values from this module (NativeWind / StyleSheet).
 */

export const palette = {
  brand: { 50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc", 400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca", 800: "#3730a3", 900: "#312e81" },
  accent: { 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706" },
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
  info: "#0284c7",
} as const;

export const light = {
  bg: "#f7f8fc", surface: "#ffffff", surfaceMuted: "#f1f3f9", border: "#e3e6ef",
  text: "#0f172a", textMuted: "#5b6478", primary: palette.brand[600], primaryText: "#ffffff",
} as const;

export const dark = {
  bg: "#0b0f1a", surface: "#131a2a", surfaceMuted: "#1a2335", border: "#273149",
  text: "#e8ecf6", textMuted: "#9aa4ba", primary: palette.brand[400], primaryText: "#0b0f1a",
} as const;

/** Domain colours (match seeded domain.color) - used in charts and badges. */
export const domainColors: Record<string, string> = {
  stem: "#4f46e5",
  "creative-arts": "#db2777",
  business: "#d97706",
  communication: "#0891b2",
  science: "#059669",
  sports: "#dc2626",
};

export const typography = {
  fontFamily: { sans: "'Inter', system-ui, sans-serif", display: "'Plus Jakarta Sans', 'Inter', sans-serif", junior: "'Nunito', 'Inter', sans-serif" },
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
  none: { label: "Not yet explored", color: "#94a3b8" },
  low: { label: "Early evidence", color: "#f59e0b" },
  moderate: { label: "Growing evidence", color: "#0284c7" },
  high: { label: "Strong evidence", color: "#059669" },
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
