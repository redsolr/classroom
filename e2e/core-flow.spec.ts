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

test("signed-in teacher is routed from landing to the schedule", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForURL("**/schedule");
  await expect(
    page.getByRole("heading", { name: "Schedule", exact: true }),
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

test("progress tab shows deterministic counts from the record", async ({
  page,
}) => {
  await page.goto("/students");
  await page.getByRole("link", { name: studentName }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);

  await page.getByRole("tab", { name: "Progress" }).click();

  // Counts derive from the approved record: 1 vocab item (new, unmastered),
  // 1 open homework, and the lesson's single correction in the trend.
  await expect(page.getByText("Vocabulary mastered")).toBeVisible();
  await expect(page.getByText("Homework completed")).toBeVisible();
  await expect(page.getByText("Vocabulary pipeline")).toBeVisible();
  await expect(page.getByText("Corrections per lesson")).toBeVisible();
  await expect(page.getByText("0 of 1").first()).toBeVisible();
  await expect(page.getByText(/Most corrected: Grammar \(1\)/)).toBeVisible();
});

test("scheduling: future lesson → Up next → mark attended → notes", async ({
  page,
}) => {
  await page.goto("/students");
  await page.getByRole("link", { name: studentName }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);

  // A future date & time creates a *scheduled* lesson, not a draft record.
  const scheduledTitle = `Scheduled E2E ${runId}`;
  await page.getByRole("tab", { name: /^Lessons/ }).click();
  await page.getByRole("button", { name: "New lesson" }).click();
  await page.getByLabel("Title").fill(scheduledTitle);
  await page.getByLabel("Date & time").fill("2030-01-01T14:00");
  await page.getByRole("button", { name: "Create lesson" }).click();
  await page.waitForURL(/\/lessons\/[0-9a-f-]{36}/);
  const lessonUrl = page.url();
  await expect(page.getByText(/Scheduled for/)).toBeVisible();

  // It surfaces in the dashboard "Up next" feed…
  await page.goto("/dashboard");
  await expect(page.getByText(scheduledTitle).first()).toBeVisible();

  // …and marking it attended opens the normal notes flow.
  await page.goto(lessonUrl);
  await page.getByRole("button", { name: "Mark attended" }).click();
  await expect(page.getByPlaceholder(/Paste rough notes/)).toBeVisible();
});

test("student portal: enable → homework check-off → teacher sees submission", async ({
  page,
}) => {
  await page.goto("/students");
  await page.getByRole("link", { name: studentName }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);

  // Enable the portal from the student actions menu.
  await page.getByRole("button", { name: "Student actions" }).click();
  await page.getByText("Enable student portal").click();

  // The header now shows the live portal link; open it as the student.
  const portalLink = page.getByRole("link", { name: /Student portal/ });
  await expect(portalLink).toBeVisible();
  const href = await portalLink.getAttribute("href");
  expect(href).toBeTruthy();

  await page.goto(href!);
  await expect(
    page.getByRole("heading", { name: new RegExp(`Hi ${studentName}`) }),
  ).toBeVisible();
  await expect(
    page.getByText("write 5 sentences using past tense").first(),
  ).toBeVisible();
  await expect(page.getByText("stakeholder").first()).toBeVisible();

  // Private lesson notes never reach the portal.
  await expect(page.getByText(privateSecret)).toHaveCount(0);

  // Check off the homework — it becomes `submitted`, never auto-completed.
  await page
    .getByPlaceholder(/Write your answer here/)
    .fill("I finished my sentences: I went, I saw, I did.");
  await page.getByRole("button", { name: "Send to teacher" }).click();
  await expect(page.getByText("Nothing to do right now")).toBeVisible();
  await expect(page.getByText("submitted").first()).toBeVisible();

  // The teacher sees the submission on the student's homework record.
  await page.goto("/students");
  await page.getByRole("link", { name: studentName }).click();
  await page.getByRole("tab", { name: /^Homework/ }).click();
  await expect(page.getByText("submitted").first()).toBeVisible();
});

test("practice: grade a due card → vocabulary pipeline advances", async ({
  page,
}) => {
  // Reuse the live portal link from the student's header.
  await page.goto("/students");
  await page.getByRole("link", { name: studentName }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);
  const href = await page
    .getByRole("link", { name: /Student portal/ })
    .getAttribute("href");
  expect(href).toBeTruthy();

  // The never-reviewed word is due; grade it Good.
  await page.goto(`${href}/practice`);
  await expect(page.getByText("stakeholder")).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).click();
  await page.getByRole("button", { name: "Good", exact: true }).click();
  await expect(page.getByText(/You reviewed 1 card/)).toBeVisible();

  // The review is evidence: the teacher's pipeline moves new → learning,
  // visible in the Progress tab ("in review" = learning + reviewing).
  await page.goto("/students");
  await page.getByRole("link", { name: studentName }).click();
  await page.getByRole("tab", { name: "Progress" }).click();
  await expect(page.getByText("1 in review")).toBeVisible();
});

test("durability: paste-import students, filter by source, export the record", async ({
  page,
}) => {
  // Paste-import two students (comma- and tab-separated lines).
  await page.goto("/students");
  await page.getByRole("button", { name: "Import" }).click();
  await page
    .getByPlaceholder(/Maria García/)
    .fill(
      `Import Maki ${runId}, Japanese, N3, italki\nImport Pedro ${runId}\tSpanish\tB1\tPreply`,
    );
  await page.getByRole("button", { name: "Import students" }).click();
  await expect(page.getByText("Imported 2 students")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByRole("link", { name: `Import Maki ${runId}` }),
  ).toBeVisible();

  // The source filter shows the cross-platform roster (workflow 5).
  await page.getByRole("button", { name: "italki", exact: true }).click();
  await expect(
    page.getByRole("link", { name: `Import Maki ${runId}` }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Import Pedro ${runId}` }),
  ).toBeHidden();
  await page.getByRole("button", { name: "all sources", exact: true }).click();

  // Full-record JSON export from the student actions menu.
  await page.getByRole("link", { name: studentName }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Student actions" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByText("Export record (JSON)").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain("classroom-e2e-student");

  // The student's Anki-ready CSV is served on their portal token.
  const href = await page
    .getByRole("link", { name: /Student portal/ })
    .getAttribute("href");
  const res = await page.request.get(`${href}/vocabulary.csv`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("stakeholder");
});

test("study companion: portal AI chat is grounded in the student's record", async ({
  page,
}) => {
  await page.goto("/students");
  await page.getByRole("link", { name: studentName }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);
  const href = await page
    .getByRole("link", { name: /Student portal/ })
    .getAttribute("href");

  await page.goto(`${href}/chat`);
  await page
    .getByPlaceholder("Say something…")
    .fill("Can we practice a little?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Can we practice a little?")).toBeVisible();
  // The (mock) companion answers from the student's own shared record:
  // their vocabulary and their teacher's correction — not generic chat.
  await expect(page.getByText(/stakeholder/).first()).toBeVisible();
  await expect(page.getByText(/she goes/).first()).toBeVisible();
});

test("schedule: agenda lists the appointment, row opens student context", async ({
  page,
}) => {
  // Book the appointment from the schedule itself, picking the student
  // through the type-to-filter combobox.
  const agendaTitle = `Agenda E2E ${runId}`;
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Schedule lesson" }).click();
  await page.getByPlaceholder("Search students…").fill(studentName);
  await page.getByRole("option", { name: studentName }).click();
  await page.getByLabel("Title").fill(agendaTitle);
  await page.getByLabel("Date & time").fill("2031-06-01T09:00");
  await page.getByRole("button", { name: "Create lesson" }).click();
  await page.waitForURL(/\/lessons\/[0-9a-f-]{36}/);

  // The agenda shows it; clicking the row opens the context panel.
  await page.goto("/schedule");
  await page
    .getByRole("link", { name: new RegExp(agendaTitle) })
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: studentName, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Suggested focus")).toBeVisible();
  await expect(page.getByText(/Homework to check/)).toBeVisible();
  await expect(page.getByText("she go", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mark attended" }),
  ).toBeVisible();
});

test("calendar: slot click → prefilled booking → stays put, chip pops in", async ({
  page,
}) => {
  // Fixed week so slot labels are deterministic (2031-06-02 is a Monday).
  await page.goto("/calendar?week=2031-06-02");
  await page.getByLabel("Schedule Mon Jun 2 at 10:00").click();

  // The dialog opens prefilled with the clicked slot.
  await expect(page.getByLabel("Date & time")).toHaveValue("2031-06-02T10:00");
  await page.getByPlaceholder("Search students…").fill(studentName);
  await page.getByRole("option", { name: studentName }).click();
  await page.getByLabel("Title").fill(`Calendar E2E ${runId}`);
  await page.getByRole("button", { name: "Create lesson" }).click();

  // No detour to the lesson page: we land back on the calendar with the
  // new booking highlighted (one-time entrance animation).
  await page.waitForURL(/\/calendar\?week=2031-06-02&created=[0-9a-f-]{36}/);
  const chip = page.getByText(new RegExp(`10:00 ${studentName}`)).first();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveClass(/chip-created/);
});

test("teacher accounts are kept out of the student area", async ({ page }) => {
  await page.goto("/student");
  await page.waitForURL("**/schedule");
  await expect(
    page.getByRole("heading", { name: "Schedule", exact: true }),
  ).toBeVisible();
});

test("an invalid recap token is a 404, not a data leak", async ({ page }) => {
  const response = await page.goto(`/r/definitely-not-a-real-token-${runId}`);
  expect(response?.status()).toBe(404);
});
