// Colours mirror packages/design-system tokens: editorial neutrals + orange-red accent.
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "#f7f7f5",
        surface: "#ffffff",
        muted: "#eeeeec",
        line: "#e5e5e3",
        ink: "#171717",
        subtle: "#6b6b6b",
        primary: "#ff4d24",
        "primary-ink": "#c72e12",
        dark: "#171717",
        "primary-soft": "#ffece6",
        danger: "#e93822",
        "danger-soft": "#fef2f2",
        success: "#059669",
      },
    },
  },
  plugins: [],
};
