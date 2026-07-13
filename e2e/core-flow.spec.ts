import { expect, test } from "@playwright/test";

/**
 * The MVP success criteria from the product spec, end-to-end:
 *   create a student → create a lesson → paste rough notes → AI draft →
 *   review/approve → records saved → share a recap → the student sees
 *   only approved content (never private notes).
 */

const runId = Date.now().toString(36);
const studentName = `E2E Student ${runId}`;
const privateSecret = `private-note-secret-${runId}`;

test("signed-in teacher is routed from landing to dashboard", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForURL("**/dashboard");
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible();
});

test("create a student and land on their profile", async ({ page }) => {
  await page.goto("/students");
  await page.getByRole("button", { name: "New student" }).click();
  await page.getByLabel("Name").fill(studentName);
  await page.getByLabel("Target language").fill("English");
  await page.getByLabel("Current level").fill("B1");
  await page.getByRole("button", { name: "Create student" }).click();

  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);
  await expect(
    page.getByRole("heading", { name: new RegExp(studentName) }),
  ).toBeVisible();
  await expect(page.getByText("English · B1")).toBeVisible();
});

test("full lesson loop: notes → AI draft → approve → records → public recap", async ({
  page,
  context,
}) => {
  // Find the student created in the previous test.
  await page.goto("/students");
  await page.getByRole("link", { name: studentName }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);

  // Create a lesson from the Lessons tab.
  await page.getByRole("tab", { name: /^Lessons/ }).click();
  await page.getByRole("button", { name: "New lesson" }).click();
  await page.getByLabel("Title").fill("E2E lesson");
  await page.getByRole("button", { name: "Create lesson" }).click();
  await page.waitForURL(/\/lessons\/[0-9a-f-]{36}/);

  // Save a private note — it must NEVER reach the public recap.
  await page
    .locator('textarea[name="teacherPrivateNotes"]')
    .fill(`Struggles with confidence. ${privateSecret}`);
  await page.getByRole("button", { name: "Save notes" }).click();

  // Paste rough notes and process with (mock) AI.
  await page
    .getByPlaceholder(/Paste rough notes/)
    .fill(
      [
        "she go -> she goes",
        "vocab: stakeholder",
        "hw: write 5 sentences using past tense",
        "topic: meetings",
      ].join("\n"),
    );
  await page.getByRole("button", { name: "Process with AI" }).click();

  // The draft review appears; approve everything.
  await expect(page.getByText("AI draft — review before saving")).toBeVisible();
  await expect(page.getByText("4 items will be saved")).toBeVisible();
  await page.getByRole("button", { name: "Save approved items" }).click();

  // Approved items became permanent lesson records.
  await expect(page.getByText("Corrections (1)")).toBeVisible();
  await expect(page.getByText("Vocabulary (1)")).toBeVisible();
  await expect(page.getByText("Homework (1)")).toBeVisible();
  await expect(page.getByText("Topics (1)")).toBeVisible();
  await expect(page.getByText("she goes").first()).toBeVisible();

  // The recap summary was prefilled from the AI draft; share it.
  const recapSummary = page.locator('textarea[name="studentVisibleSummary"]');
  await expect(recapSummary).not.toHaveValue("");
  await page.getByRole("button", { name: "Share recap" }).click();

  // A public link appears; open it as an anonymous visitor.
  const recapLink = page.locator('a[href*="/r/"]');
  await expect(recapLink).toBeVisible();
  const href = await recapLink.getAttribute("href");
  expect(href).toBeTruthy();

  const anonymousPage = await context.browser()!.newPage();
  await anonymousPage.goto(href!);

  // Approved content is visible…
  await expect(anonymousPage.getByText("Corrections to review")).toBeVisible();
  await expect(anonymousPage.getByText("she goes").first()).toBeVisible();
  await expect(anonymousPage.getByText("stakeholder").first()).toBeVisible();
  await expect(
    anonymousPage.getByText("write 5 sentences using past tense", {
      exact: true,
    }),
  ).toBeVisible();

  // …and the private note never leaks.
  await expect(anonymousPage.getByText(privateSecret)).toHaveCount(0);

  await anonymousPage.close();
});

test("prep sheet assembles the approved record for the next lesson", async ({
  page,
}) => {
  await page.goto("/students");
  await page.getByRole("link", { name: studentName }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);

  await page.getByRole("link", { name: "Prep sheet" }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}\/prep/);
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`Next lesson with ${studentName}`),
    }),
  ).toBeVisible();

  // Everything approved in the lesson loop feeds the sheet: the correction
  // to re-drill, the vocabulary to review, and the homework to check.
  await expect(page.getByText("she goes").first()).toBeVisible();
  await expect(page.getByText("stakeholder").first()).toBeVisible();
  await expect(
    page.getByText("write 5 sentences using past tense").first(),
  ).toBeVisible();
});

test("timeline shows the student's whole history in one stream", async ({
  page,
}) => {
  await page.goto("/students");
  await page.getByRole("link", { name: studentName }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);

  await page.getByRole("tab", { name: "Timeline" }).click();

  // One stream: the lesson, its extracted records, and the shared recap.
  await expect(page.getByText("Recap shared").first()).toBeVisible();
  await expect(page.getByText("1 correction added").first()).toBeVisible();
  await expect(
    page.getByText("1 vocabulary item added").first(),
  ).toBeVisible();
  await expect(page.getByText("Homework assigned").first()).toBeVisible();
  await expect(page.getByText("she go → she goes").first()).toBeVisible();
});

test("an invalid recap token is a 404, not a data leak", async ({ page }) => {
  const response = await page.goto(`/r/definitely-not-a-real-token-${runId}`);
  expect(response?.status()).toBe(404);
});
