import { defineConfig, devices } from "@playwright/test";

/** Runs against a live stack: API on :8000 (seeded with --demo) and Vite on :5173. */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /responsive|mobile-app/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive|mobile-app/ },
  ],
});
