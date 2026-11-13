import { expect, test } from "@playwright/test";

test("dashboard works at phone width with no horizontal scroll", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email or mobile number").fill("ananya@pathfinder.demo");
  await page.getByLabel("Password").fill("Demo@1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByText(/Ready for an adventure/)).toBeVisible(); // junior experience (age 8)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Achievements" }).click();
  await expect(page.getByRole("heading", { name: "Achievements" })).toBeVisible();
});
