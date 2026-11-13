import { expect, test } from "@playwright/test";

test("dashboard works at phone width with no horizontal scroll", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email or mobile number").fill("ananya@pathfinder.demo");
  await page.getByLabel("Password", { exact: true }).fill("Demo@1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByText(/Ready for an adventure/)).toBeVisible(); // junior experience (age 8)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Achievements", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Achievements" })).toBeVisible();
});

const ROLE_PAGES: Array<[string, string[]]> = [
  ["aarav", ["/app", "/app/courses", "/app/tasks", "/app/sessions", "/app/progress", "/app/messages", "/app/profile"]],
  ["mentor", ["/mentor", "/mentor/sessions", "/mentor/students"]],
  ["parent", ["/parent"]],
  ["superadmin", ["/admin", "/admin/roles", "/admin/allocation"]],
];

for (const [user, paths] of ROLE_PAGES) {
  test(`${user} pages fit a phone screen`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email or mobile number").fill(`${user}@pathfinder.demo`);
    await page.getByLabel("Password", { exact: true }).fill("Demo@1234");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    }
  });
}
