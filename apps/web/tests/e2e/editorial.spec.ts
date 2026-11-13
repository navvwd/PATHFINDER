import { expect, test } from "@playwright/test";
const out = process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/ed-` : "test-results/ed-";
test.setTimeout(150_000);
test("phone + app", async ({ browser }) => {
  // phone landing + menu
  let c = await browser.newContext({ viewport: { width: 390, height: 844 }, baseURL: "http://localhost:5173" });
  let p = await c.newPage();
  await p.goto("/"); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1800);
  expect(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await p.screenshot({ path: `${out}phone-hero.png` });
  await p.getByRole("button", { name: "Open menu" }).click(); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}phone-menu.png` });
  await c.close();

  // domain selection carries into onboarding
  c = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: "http://localhost:5173" });
  p = await c.newPage();
  await p.goto("/"); await p.waitForLoadState("networkidle");
  const cards = p.locator("#domains article");
  await cards.filter({ hasText: "Science & Research" }).getByRole("button", { name: "Select" }).click();
  await cards.filter({ hasText: "Sports & Physical" }).getByRole("button", { name: "Select" }).click();
  await p.getByRole("button", { name: "Start with these" }).click();
  await p.waitForURL(/\/register/);
  const email = `editorial-${Date.now()}@example.com`;
  await p.getByLabel("Full name").fill("Editorial Tester");
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Date of birth").fill("2011-03-03");
  await p.getByLabel("Password", { exact: true }).fill("Passw0rd!");
  await p.getByLabel("Confirm password").fill("Passw0rd!");
  await p.getByRole("button", { name: "Create student account" }).click();
  await p.getByLabel("School", { exact: true }).fill("Test School"); await p.getByLabel("Grade").fill("9");
  await p.getByRole("button", { name: "Save & continue" }).click();
  await expect(p.getByRole("button", { name: /Science & Research/, pressed: true })).toBeVisible();
  await expect(p.getByRole("button", { name: /Sports & Physical/, pressed: true })).toBeVisible();
  await p.screenshot({ path: `${out}onboarding-preselected.png` });
  await c.close();

  // signed-in app
  c = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: "http://localhost:5173" });
  p = await c.newPage();
  await p.goto("/login");
  await p.getByLabel("Email or mobile number").fill("kabir@pathfinder.demo");
  await p.getByLabel("Password", { exact: true }).fill("Demo@1234");
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(/\/app$/); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}app-dashboard.png` });
  await p.locator("aside details summary").click();
  await p.getByRole("link", { name: "My Skills" }).click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}app-skills.png` });
  await p.getByRole("link", { name: "AI Insights" }).click();
  await p.getByRole("button", { name: "Generate insights" }).click(); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}app-insights.png` });
  for (const name of ["Challenges", "Growth Timeline", "Interest Discovery"]) {
    await p.getByRole("link", { name }).click(); await p.waitForTimeout(800);
    await expect(p.locator("main h1")).toBeVisible();
  }
  await expect(p.getByRole("tab", { name: "Discovery questionnaire", selected: true })).toBeVisible();
  await c.close();
});
