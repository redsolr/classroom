import { expect, test } from "@playwright/test";
import postgres from "postgres";

/**
 * The self-study space (/study): projects with custom instructions
 * (ChatGPT-Projects shape), tutor chat in language projects (offline
 * mock tutor — demonstrably grounded in the learner's vocab), generic
 * loose chats, the personal vocabulary loop (chip-add, manual add, SM-2
 * review), and the free-tier daily cap (STUDY_FREE_DAILY_CAP=5 set by
 * playwright.config for this suite).
 *
 * The mock learner accumulates rows across local runs (persistent
 * Postgres, fixed mock identity), so the suite resets that learner
 * up-front — same idempotence idea as `db:seed` re-wiping the demo
 * teacher.
 */

const FREE_CAP = 5;

test.beforeAll(async () => {
  const sql = postgres(
    process.env.DATABASE_URL ??
      "postgresql://classroom:classroom@localhost:5439/classroom",
    { max: 1 },
  );
  try {
    // Cascades to study_projects, study_threads, study_messages, study_vocab.
    await sql`delete from learners where workos_user_id = 'mock_teacher_dev'`;
  } finally {
    await sql.end();
  }
});

test("study space opens on the new-chat hero", async ({ page }) => {
  await page.goto("/study");
  await expect(
    page.getByRole("heading", { name: "What are we studying today?" }),
  ).toBeVisible();
});

test("language project with custom instructions: tutor reply is grounded AND follows instructions", async ({
  page,
}) => {
  await page.goto("/study/project/new");
  await page.getByLabel("Name").fill("French");
  await page.getByLabel(/Language/).selectOption("French");
  await page.getByLabel(/Custom instructions/).fill("Always be brief.");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);

  // New chat from the project page inherits language + instructions.
  await page.getByRole("button", { name: "New chat" }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  await page.getByLabel("Message").fill("Bonjour! Je veux apprendre.");
  await page.getByRole("button", { name: "Send" }).click();

  // Mock tutor: language mode + the instructions-reached-the-prompt probe.
  await expect(page.getByText(/Let's practice your French/)).toBeVisible();
  await expect(
    page.getByText(/Following your project instructions/),
  ).toBeVisible();

  // With an empty vocab list it suggests a starter word as a chip.
  const chip = page.getByRole("button", { name: /bonjour — hello/ });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(chip).toBeDisabled();

  // The saved word is on the vocabulary page, filed under French.
  // (Scope to main — the sidebar chat tree also contains "Bonjour…".)
  await page.goto("/study/vocab");
  await expect(page.getByRole("heading", { name: "French" })).toBeVisible();
  await expect(page.getByRole("main").getByText("bonjour")).toBeVisible();
});

test("a loose chat is generic: no tutor persona, no instructions tail", async ({
  page,
}) => {
  await page.goto("/study");
  await page.getByRole("button", { name: "New chat" }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  await page.getByLabel("Message").fill("help me plan my week");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/Happy to help with anything/)).toBeVisible();
  await expect(page.getByText(/Let's practice your/)).not.toBeVisible();
  await expect(
    page.getByText(/Following your project instructions/),
  ).not.toBeVisible();
});

test("pin floats a chat into Pinned; unpin returns it to its project", async ({
  page,
}) => {
  await page.goto("/study");
  const sidebar = page.getByRole("complementary");
  const row = sidebar
    .locator("div.group")
    .filter({ has: page.getByRole("link", { name: /Bonjour/ }) });

  await row.hover();
  await row.getByRole("button", { name: "Pin chat" }).click();
  await expect(sidebar.getByText("Pinned", { exact: true })).toBeVisible();

  await row.hover();
  await row.getByRole("button", { name: "Unpin chat" }).click();
  await expect(sidebar.getByText("Pinned", { exact: true })).not.toBeVisible();
  await expect(sidebar.getByRole("link", { name: /Bonjour/ })).toBeVisible();
});

test("editing project instructions + name applies to later replies and the sidebar", async ({
  page,
}) => {
  await page.goto("/study");
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "French", exact: true })
    .click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);

  await page.getByLabel("Name").fill("Français");
  await page.getByLabel(/Custom instructions/).fill("Use emojis.");
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(
    page.getByRole("complementary").getByRole("link", { name: "Français" }),
  ).toBeVisible();

  // The updated instructions reach the next reply (mock probe).
  await page.getByRole("link", { name: /Bonjour/ }).first().click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);
  await page.getByLabel("Message").fill("encore une fois");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByText(/Following your project instructions/).last(),
  ).toBeVisible();
  // And with “bonjour” saved, the tutor drills the learner's own word.
  await expect(page.getByText(/Try using/).last()).toBeVisible();
});

test("deleting a chat removes it after the confirm dialog", async ({
  page,
}) => {
  await page.goto("/study");
  const loose = page
    .getByRole("complementary")
    .getByRole("link", { name: /help me plan/ });
  await loose.click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete chat" }).click();
  await page.waitForURL(/\/study$/);
  await expect(
    page.getByRole("complementary").getByRole("link", { name: /help me plan/ }),
  ).not.toBeVisible();
});

test("deleting a project frees its chats instead of destroying them", async ({
  page,
}) => {
  await page.goto("/study/project/new");
  await page.getByLabel("Name").fill("Temp");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);

  // A chat inside it (no message sent — stays "New chat").
  await page.getByRole("button", { name: "New chat" }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Temp" })
    .click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Delete project" }).click();
  await page.waitForURL(/\/study$/);

  // The chat survived — now a loose chat in the sidebar.
  await expect(
    page.getByRole("complementary").getByRole("link", { name: "New chat" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary").getByText("Chats", { exact: true }),
  ).toBeVisible();
});

test("manual vocab add + SM-2 review session over the due deck", async ({
  page,
}) => {
  await page.goto("/study/vocab");
  await page.getByLabel("Language").selectOption("Japanese");
  await page.getByLabel("Word or phrase").fill("猫");
  await page.getByLabel(/Reading/).fill("neko");
  await page.getByLabel("Meaning").fill("cat");
  await page.getByRole("button", { name: "Add word" }).click();
  await expect(page.getByRole("heading", { name: "Japanese" })).toBeVisible();

  // Both saved words are due (never reviewed) — review the whole deck.
  await page.goto("/study/vocab/review");
  await expect(page.getByText("Card 1 of 2")).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Show answer" }).click();
    await page.getByRole("button", { name: "Good" }).click();
  }
  await expect(page.getByText("2 cards reviewed")).toBeVisible();

  // Graded cards moved out of "due" — the list shows pipeline status.
  await page.goto("/study/vocab");
  await expect(page.getByText("0 due for review")).toBeVisible();
});

test("free daily cap blocks the tutor and points at the upgrade", async ({
  page,
}) => {
  await page.goto("/study");
  // Reuse the French thread via the sidebar chat tree (titled by its
  // first message). 3 of the 5 free messages are already spent.
  await page.getByRole("link", { name: /Bonjour/ }).first().click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  // Send until the API answers 429 — must happen within the cap budget.
  let capStatus = 0;
  for (let i = 0; i < FREE_CAP + 1 && capStatus !== 429; i++) {
    await page.getByLabel("Message").fill(`practice message ${i}`);
    const [res] = await Promise.all([
      page.waitForResponse("**/api/study/chat"),
      page.getByRole("button", { name: "Send" }).click(),
    ]);
    capStatus = res.status();
    // Turn is over when the composer takes focus back (finally block).
    await expect(page.getByLabel("Message")).toBeFocused();
  }

  expect(capStatus, "the free cap must trip within its own budget").toBe(429);
  await expect(page.getByText(/free messages for today/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Upgrade to keep practicing" }),
  ).toBeVisible();
});

test("account page: free plan, usage meter, billing-not-configured state", async ({
  page,
}) => {
  await page.goto("/study/account");
  await expect(page.getByRole("heading", { name: "Free plan" })).toBeVisible();
  await expect(page.getByText(/of 5 tutor messages/)).toBeVisible();
  await expect(page.getByText(/Billing is not configured/)).toBeVisible();
  // Models card names the roster.
  await expect(page.getByText("gpt-5.6-terra")).toBeVisible();
  await expect(page.getByText("gpt-5.6-sol")).toBeVisible();
});
