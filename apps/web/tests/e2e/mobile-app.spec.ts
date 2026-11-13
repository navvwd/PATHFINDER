import { expect, test } from "@playwright/test";

// Drives the Expo (React Native) app through react-native-web on a phone viewport.
// Requires: `npx expo start --web --port 8081` in apps/mobile and the API on :8000.
const MOBILE_URL = process.env.MOBILE_URL ?? "http://localhost:8081";

test.describe("mobile app (Expo web build)", () => {
  test.skip(!!process.env.SKIP_MOBILE_E2E, "mobile dev server not running");

  test("student signs in, sees dashboard, opens an activity and progress", async ({ page }) => {
    await page.goto(MOBILE_URL);
    await page.getByLabel("Email or mobile number").fill("diya@pathfinder.demo");
    await page.getByLabel("Password").fill("Demo@1234");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Good (morning|afternoon|evening), Diya!/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Today's activities")).toBeVisible();
    await page.getByText("Explore", { exact: true }).click();
    await expect(page.getByText("STEM & Technology").first()).toBeVisible();
    await page.getByText("Progress", { exact: true }).click();
    await expect(page.getByText("Compared only with your past self.")).toBeVisible();
  });

  test("guardian sees only linked children", async ({ page }) => {
    await page.goto(MOBILE_URL);
    await page.getByLabel("Email or mobile number").fill("parent@pathfinder.demo");
    await page.getByLabel("Password").fill("Demo@1234");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Aarav Mehta")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Diya Nair")).toHaveCount(0);
    await page.getByText("Aarav Mehta").click();
    await expect(page.getByText("Chosen interests")).toBeVisible();
  });
});
