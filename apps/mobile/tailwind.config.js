// Colours mirror packages/design-system tokens (light theme).
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#f7f8fc",
        surface: "#ffffff",
        muted: "#f1f3f9",
        line: "#e3e6ef",
        ink: "#0f172a",
        subtle: "#5b6478",
        primary: "#4f46e5",
        "primary-soft": "#eef2ff",
        danger: "#dc2626",
        "danger-soft": "#fef2f2",
        success: "#059669",
      },
    },
  },
  plugins: [],
};
