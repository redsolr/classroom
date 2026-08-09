import { expect, test } from "@playwright/test";
import { resetMockLearner } from "./helpers";

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

test.beforeAll(resetMockLearner);

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
  // Wait for the SAVED state, not just disabled — the chip also disables
  // while the action is in flight, and navigating away at that moment
  // aborts the save (this exact race flaked the suite).
  await expect(chip).toHaveAttribute("title", "Added to your vocabulary");
  await expect(chip).toBeDisabled();

  // The saved word is a row in the vocabulary table, filed under French.
  // (Scope to main — the sidebar chat tree also contains "Bonjour…".)
  await page.goto("/study/vocab");
  const row = page
    .getByRole("main")
    .locator("tbody tr")
    .filter({ hasText: "bonjour" });
  await expect(row.getByRole("cell", { name: "French" })).toBeVisible();
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
  // Settings live behind the folder's ⋯ menu (the label only expands).
  await page.getByRole("button", { name: "French options" }).click();
  await page.getByRole("menuitem", { name: "Project settings" }).click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);

  await page.getByLabel("Name").fill("Français");
  await page.getByLabel(/Custom instructions/).fill("Use emojis.");
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(
    page
      .getByRole("complementary")
      .getByRole("button", { name: "Français", exact: true }),
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
  const emptyChatUrl = page.url();

  // Tapping + again REUSES the empty chat (no blank-thread littering).
  // The redirect targets the SAME url, so waitForURL resolves instantly —
  // settle the in-flight RSC response before opening the menu, or it
  // re-renders the sidebar and closes the dropdown mid-click.
  await page.getByRole("button", { name: "Start Temp chat" }).click();
  await page.waitForLoadState("networkidle");
  expect(page.url()).toBe(emptyChatUrl);

  // Delete straight from the folder's ⋯ menu (confirm dialog).
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Temp options" }).click();
  await page.getByRole("menuitem", { name: "Delete project" }).click();
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
  await expect(
    page.getByRole("main").getByRole("cell", { name: "猫" }),
  ).toBeVisible();

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

test("vocab table: columns, sort, and language filter", async ({ page }) => {
  await page.goto("/study/vocab");
  const table = page.getByRole("main").locator("table");
  for (const col of [
    "Term",
    "Reading",
    "Meaning",
    "Language",
    "Status",
    "Due",
    "Reps",
  ]) {
    await expect(table.getByText(col, { exact: true })).toBeVisible();
  }

  // Default order = newest first (猫 was added after bonjour); sorting
  // by term ascending flips it (latin collates before CJK).
  const terms = table.locator("tbody tr td:first-child");
  await expect(terms.first()).toHaveText("猫");
  await table.getByRole("button", { name: "Term" }).click();
  await expect(terms.first()).toHaveText("bonjour");

  // Language chips narrow the table to one language.
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Japanese", exact: true }).click();
  await expect(table.getByRole("cell", { name: "bonjour" })).not.toBeVisible();
  await expect(table.getByRole("cell", { name: "猫" })).toBeVisible();
  await main.getByRole("button", { name: "all", exact: true }).click();
  await expect(table.getByRole("cell", { name: "bonjour" })).toBeVisible();
});

test("edit-in-place updates a word and survives reload", async ({ page }) => {
  await page.goto("/study/vocab");
  const table = page.getByRole("main").locator("table");
  await table
    .locator("tbody tr")
    .filter({ hasText: "猫" })
    .getByTitle("Edit word")
    .click();

  // In edit mode the term is an input, so re-locate the row by its
  // edit fields (hasText no longer sees the term).
  const editRow = table
    .locator("tbody tr")
    .filter({ has: page.getByLabel("Edit term") });
  await expect(editRow.getByLabel("Edit term")).toHaveValue("猫");
  await editRow.getByLabel("Edit meaning").fill("cat (animal)");
  await editRow.getByTitle("Save word").click();
  await expect(
    table.getByRole("cell", { name: /cat \(animal\)/ }),
  ).toBeVisible();

  // Persisted, not just local state. Scope to the table: the phone card
  // list renders the same word (hidden at this width, but getByText still
  // matches it).
  await page.reload();
  await expect(
    table.getByRole("cell", { name: /cat \(animal\)/ }),
  ).toBeVisible();
});

test("CSV export serves the personal list Anki-ready", async ({ page }) => {
  await page.goto("/study/vocab");
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();

  const res = await page.request.get("/study/vocab/export.csv");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  expect(res.headers()["content-disposition"]).toContain("vocabulary.csv");

  const body = await res.text();
  expect(
    body.startsWith("﻿"),
    "UTF-8 BOM — without it Excel mojibakes 猫 and accented French",
  ).toBe(true);

  const [header, ...rows] = body.slice(1).split("\r\n");
  expect(header).toBe("term,reading,meaning,example,language,status");
  expect(
    rows.some((r) => r.startsWith('"猫","neko","cat (animal)"')),
    "the edited Japanese word must export with its reading",
  ).toBe(true);
  expect(
    rows.some((r) => r.startsWith('"bonjour"')),
    "the chip-saved French word must export",
  ).toBe(true);
});

test("Escape cancels an edit, Enter saves it, and delete takes two clicks", async ({
  page,
}) => {
  // A throwaway word, so this test leaves the list exactly as it found it.
  await page.goto("/study/vocab");
  await page.getByLabel("Language").selectOption("Spanish");
  await page.getByLabel("Word or phrase").fill("perro");
  await page.getByLabel("Meaning").fill("dog");
  await page.getByRole("button", { name: "Add word" }).click();

  const table = page.getByRole("main").locator("table");
  const row = () => table.locator("tbody tr").filter({ hasText: "perro" });
  const editRow = table
    .locator("tbody tr")
    .filter({ has: page.getByLabel("Edit term") });

  // Escape abandons the edit — the original meaning survives.
  await row().getByTitle("Edit word").click();
  await editRow.getByLabel("Edit meaning").fill("cat");
  await editRow.getByLabel("Edit meaning").press("Escape");
  await expect(row()).toContainText("dog");
  await expect(row()).not.toContainText("cat");

  // Enter commits without reaching for the mouse.
  await row().getByTitle("Edit word").click();
  await editRow.getByLabel("Edit meaning").fill("dog (Spanish)");
  await editRow.getByLabel("Edit meaning").press("Enter");
  await expect(row()).toContainText("dog (Spanish)");

  // Delete arms first — one stray click next to the pencil can't destroy a word.
  const del = row().getByTitle("Delete word");
  await del.click();
  await expect(del).toContainText("Sure?");
  await expect(row()).toBeVisible();

  await del.click();
  await expect(row()).toHaveCount(0);
});

test("chat→vocab bulk extraction: review dialog, bulk save, dedup", async ({
  page,
}) => {
  // A German project: its vocab list is empty, so the mock tutor
  // suggests its starter word as a VOCAB line.
  await page.goto("/study/project/new");
  await page.getByLabel("Name").fill("German");
  await page.getByLabel(/Language/).selectOption("German");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);

  await page.getByRole("button", { name: "New chat" }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);
  const threadUrl = page.url();

  // One send — counts against the suite's shared cap budget.
  await page.getByLabel("Message").fill("Guten Tag! Ich lerne Deutsch.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Let's practice your German/)).toBeVisible();

  // The tutor marked a word; do NOT tap its chip — extraction must find
  // it by reading the transcript.
  await page.getByTitle("Save words from this chat").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("bonjour")).toBeVisible();
  await dialog.getByRole("button", { name: "Add 1 word" }).click();
  await expect(dialog.getByText(/Added 1 word/)).toBeVisible();
  await dialog.getByRole("link", { name: /Open my vocabulary/ }).click();

  // Filed under German (bonjour also exists under French — the term
  // dedup is per language).
  await page.waitForURL("**/study/vocab");
  const row = page
    .getByRole("main")
    .locator("tbody tr")
    .filter({ hasText: "German" });
  await expect(row.getByRole("cell", { name: "bonjour" })).toBeVisible();

  // Round 2 proves dedup: the word is on the list now, so extraction
  // comes back empty instead of proposing it again.
  await page.goto(threadUrl);
  await page.getByTitle("Save words from this chat").click();
  await expect(
    page.getByRole("dialog").getByText(/No new words found/),
  ).toBeVisible();
});

test("free daily cap blocks the tutor and points at the upgrade", async ({
  page,
}) => {
  await page.goto("/study");
  // Reuse the French thread via the sidebar chat tree (titled by its
  // first message). 4 of the 5 free messages are already spent.
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
