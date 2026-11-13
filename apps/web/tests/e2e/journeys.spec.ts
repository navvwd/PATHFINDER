import { expect, test, type Page } from "@playwright/test";

const PW = "Demo@1234";

/** Expand the student's collapsible "Explore & grow" nav group if it is closed. */
async function openMore(page: Page) {
  const more = page.locator("aside details", { hasText: "Explore & grow" });
  if (await more.count() && (await more.getAttribute("open")) === null) await more.locator("summary").click();
}

async function login(page: Page, email: string, password = PW) {
  await page.goto("/login");
  await page.getByLabel("Email or mobile number").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("new student registers, onboards, explores, submits and sees progress", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Playwright Student");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Date of birth").fill("2012-04-10");
  await page.getByLabel("Password", { exact: true }).fill("Passw0rd!");
  await page.getByLabel("Confirm password").fill("Passw0rd!");
  await page.getByLabel("School code (optional)").fill("GVPS-DEMO");
  await page.getByRole("button", { name: "Create student account" }).click();

  await expect(page).toHaveURL(/\/app\/onboarding/);
  await page.getByLabel("School").fill("Green Valley");
  await page.getByLabel("Grade").fill("8");
  await page.getByRole("button", { name: "Save & continue" }).click();

  await page.getByRole("button", { name: /STEM & Technology/ }).click();
  await page.getByRole("button", { name: /Creative Arts/ }).click();
  await page.getByRole("button", { name: "Save & continue" }).click();
  await page.getByRole("button", { name: "Save & continue" }).click(); // goals
  await page.getByRole("button", { name: "I've shared the code" }).click();
  await page.getByRole("button", { name: "Finish onboarding" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Playwright/ })).toBeVisible();

  // explore all six domains
  await openMore(page);
  await page.getByRole("link", { name: "Explore Domains" }).click();
  await expect(page.locator("a[href^='/app/domains/']")).toHaveCount(6);
  await page.getByRole("link", { name: /Science & Research/ }).click();
  await expect(page.getByRole("heading", { name: "Why explore it?" })).toBeVisible();

  // complete an activity
  await page.goto("/app/activities?q=Logic");
  await page.getByRole("link", { name: /Logic Grid Puzzles/ }).first().click();
  await page.getByLabel("Your answer").fill("Puzzle 1: Ana owns the cat. Clue 3 unlocked it.");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(/waiting for mentor review/)).toBeVisible();

  // take an assessment
  await page.goto("/app/assessments");
  const card = page.locator("div.flex-col", { has: page.getByRole("heading", { name: "Coding Concepts Check" }) });
  await card.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText(/Question 1 of \d+/)).toBeVisible();
  for (let i = 0; i < 12; i++) {
    const radio = page.getByRole("radio").first();
    if (await radio.isVisible()) await radio.click();
    else if (await page.getByLabel("Your answer").isVisible()) await page.getByLabel("Your answer").fill("4");
    const next = page.getByRole("button", { name: "Next" });
    if (await next.isVisible()) await next.click();
    else break;
  }
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText(/points · attempt 1/)).toBeVisible();

  // progress + recommendations + portfolio render with real data
  await page.goto("/app/progress");
  await expect(page.getByRole("heading", { name: "Weekly activity" })).toBeVisible();
  await page.getByRole("button", { name: "Show detailed analytics" }).click();
  await expect(page.getByText("Interest vs demonstrated skill")).toBeVisible();
  await openMore(page);
  await page.getByRole("link", { name: "AI Insights" }).click();
  await page.getByRole("tab", { name: "Recommendations" }).click();
  await page.getByRole("button", { name: "Generate now" }).click();
  await expect(page.getByText(/not a test of intelligence/)).toBeVisible();
  await openMore(page);
  await page.getByRole("link", { name: "Portfolio" }).click();
  await expect(page.getByText(/Private by default/)).toBeVisible();
});

test("mentor evaluates a submission with a rubric", async ({ page }) => {
  await login(page, "mentor@pathfinder.demo");
  await expect(page).toHaveURL(/\/mentor/);
  await page.getByRole("link", { name: "Review & Feedback" }).click();
  const first = page.locator("a[href^='/mentor/reviews/']").first();
  if (await first.count()) {
    await first.click();
    for (const slider of await page.locator("input[type=range]").all()) await slider.fill("4");
    await page.getByLabel("Feedback for the student").fill("Clear reasoning - next time explain each clue.");
    await page.getByRole("button", { name: "Submit evaluation" }).click();
    await expect(page).toHaveURL(/\/mentor\/reviews$/);
  }
  await page.getByRole("link", { name: "My Students" }).click();
  await page.getByRole("row", { name: /Aarav Mehta/ }).click();
  await expect(page.getByText("Domain-wise progress")).toBeVisible();
  await page.getByRole("tab", { name: "Feedback & insights" }).click();
  const note = `Great curiosity in today's session ${Date.now()}`;
  await page.getByLabel("Note").fill(note);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(note)).toBeVisible();
});

test("parent monitors only their linked child and manages consent", async ({ page }) => {
  await login(page, "parent@pathfinder.demo");
  await expect(page).toHaveURL(/\/parent/);
  await expect(page.getByText("Aarav Mehta")).toBeVisible();
  await expect(page.getByText("Diya Nair")).toHaveCount(0);
  await expect(page.getByText("Is Aarav progressing?")).toBeVisible();
  await expect(page.getByText("Is attendance OK?").first()).toBeVisible();
  await page.locator("a[href*='/parent/children/']", { hasText: "Full details" }).first().click();
  await expect(page.getByText("Chosen interests")).toBeVisible();
  await page.getByRole("tab", { name: "Consent & privacy" }).click();
  await expect(page.getByText(/Use AI to generate guidance/)).toBeVisible();
  await page.getByRole("tab", { name: "Reports" }).click();
  await page.getByRole("button", { name: "Weekly report" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("admin manages users, institutions and domains; students are blocked from admin", async ({ page }) => {
  await login(page, "superadmin@pathfinder.demo");
  await expect(page).toHaveURL(/\/admin/);
  await page.getByRole("link", { name: "Users" }).click();
  await page.getByLabel("Search users").fill("Aarav");
  await page.getByLabel("Search users").press("Enter");
  await expect(page.getByText("Aarav Mehta")).toBeVisible();
  await page.getByRole("link", { name: "Institutions" }).click();
  await expect(page.getByText("Green Valley Public School (Demo)")).toBeVisible();
  await page.getByRole("link", { name: "Domains" }).click();
  await expect(page.getByText("Sports & Physical Development")).toBeVisible();
  await page.getByRole("link", { name: "Scoring Config" }).click();
  await expect(page.getByText("Version history")).toBeVisible();

  await page.context().clearCookies();
  await login(page, "aarav@pathfinder.demo");
  await page.goto("/admin/users");
  await expect(page).not.toHaveURL(/\/admin/);
});

test("each role gets its own navigation and cannot open other portals", async ({ page }) => {
  const cases: Array<[string, RegExp, string[], string[]]> = [
    ["aarav", /\/app$/, ["Home", "My Courses", "My Tasks", "Live Sessions", "My Progress", "Achievements", "Messages", "My Profile"], ["/mentor", "/admin", "/parent"]],
    ["mentor", /\/mentor$/, ["Overview", "My Students", "Sessions & Attendance", "Review & Feedback", "Messages"], ["/admin", "/parent", "/app"]],
    ["parent", /\/parent$/, ["My Children", "Messages", "Notifications"], ["/mentor", "/admin", "/app"]],
    ["superadmin", /\/admin$/, ["Overview", "Users", "Roles & Permissions", "Mentor Allocation", "Activity Logs", "System Health"], ["/parent", "/app"]],
  ];
  for (const [user, home, links, forbidden] of cases) {
    await page.context().clearCookies();
    await login(page, `${user}@pathfinder.demo`);
    await expect(page).toHaveURL(home);
    const nav = page.locator("aside nav");
    for (const name of links) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    for (const path of forbidden) {
      await page.goto(path);
      await expect(page).toHaveURL(home); // RequireAuth sends people back to their own home
    }
    await nav.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
  }
});

test("student sees courses, tasks and live sessions from real data", async ({ page }) => {
  await login(page, "aarav@pathfinder.demo");
  await page.getByRole("link", { name: "My Courses", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "STEM & Technology" })).toBeVisible();
  await page.getByRole("link", { name: "My Tasks", exact: true }).first().click();
  await page.getByRole("tab", { name: "Quiz results" }).click();
  await expect(page.getByText("Coding Concepts Check").first()).toBeVisible();
  await page.getByRole("link", { name: "Live Sessions", exact: true }).first().click();
  await expect(page.getByText(/You attended \d+ of \d+ sessions/)).toBeVisible();
  await expect(page.getByText("Weekly mentor check-in").first()).toBeVisible();
});

test("mentor marks attendance for a past session", async ({ page }) => {
  await login(page, "mentor@pathfinder.demo");
  await page.getByRole("link", { name: "Sessions & Attendance" }).click();
  await page.getByRole("tab", { name: "Past & attendance" }).click();
  await page.getByRole("button", { name: /attendance/i }).first().click();
  await page.getByRole("button", { name: "Mark everyone present" }).click();
  await page.getByRole("button", { name: "Save attendance" }).click();
  await expect(page.getByText("Attendance saved")).toBeVisible();
});
