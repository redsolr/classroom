import { expect, test } from "@playwright/test";
import { resetMockLearner } from "./helpers";

/**
 * The self-study space (/study): projects with custom instructions
 * (ChatGPT-Projects shape), tutor chat in language projects (offline
 * mock tutor — demonstrably grounded in the learner's vocab), generic
 * loose chats, the personal vocabulary loop (chip-add, manual add, SM-2
 * review), and the free-tier daily cap (STUDY_FREE_DAILY_CAP=15 set by
 * playwright.config for this suite — the tool/dock/memory tests all
 * spend from the same rolling-24h budget).
 *
 * The mock learner accumulates rows across local runs (persistent
 * Postgres, fixed mock identity), so the suite resets that learner
 * up-front — same idempotence idea as `db:seed` re-wiping the demo
 * teacher.
 */

const FREE_CAP = 15;

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
  // New project is a DIALOG (ChatGPT shape): create → it closes, the
  // folder lands in the sidebar, and the learner stays put — no
  // redirect to a settings page.
  await page.goto("/study");
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "New project" })
    .click();
  const projectDialog = page.getByRole("dialog");
  await projectDialog.getByLabel("Name").fill("French");
  await projectDialog.getByLabel(/Language/).selectOption("French");
  await projectDialog
    .getByLabel(/Custom instructions/)
    .fill("Always be brief.");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(projectDialog).not.toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/study");

  // A chat started from the new folder inherits language + instructions.
  await page.getByRole("button", { name: "Start French chat" }).click();
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

  // The saved word is a row in the All-words table.
  await page.goto("/study/vocab?book=all");
  await expect(
    page.getByRole("main").locator("tbody tr").filter({ hasText: "bonjour" }),
  ).toBeVisible();
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

test("pin from the chat header floats the chat into Pinned; unpin returns it home", async ({
  page,
}) => {
  // Project chats live on the PROJECT PAGE, not the sidebar (ChatGPT
  // shape) — so pinning happens from the chat header's ⋯ menu.
  await page.goto("/study");
  const sidebar = page.getByRole("complementary");
  await sidebar.getByRole("link", { name: "French", exact: true }).click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);
  await page.getByRole("main").getByRole("link", { name: /Bonjour/ }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  await page.getByRole("button", { name: "Chat options" }).click();
  await page.getByRole("menuitem", { name: "Pin chat" }).click();
  await expect(sidebar.getByText("Pinned", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: /Bonjour/ })).toBeVisible();

  // Unpin from the pinned row's own ⋯ menu — the row leaves the sidebar
  // (its home is the project page).
  const row = sidebar
    .locator("div.group")
    .filter({ has: page.getByRole("link", { name: /Bonjour/ }) });
  await row.hover();
  await row.getByRole("button", { name: /options/ }).click();
  await page.getByRole("menuitem", { name: "Unpin" }).click();
  await expect(sidebar.getByText("Pinned", { exact: true })).not.toBeVisible();
  await expect(sidebar.getByRole("link", { name: /Bonjour/ })).not.toBeVisible();
});

test("editing project instructions + name applies to later replies and the sidebar", async ({
  page,
}) => {
  await page.goto("/study");
  // Settings live behind the project row's ⋯ menu (the label navigates).
  await page.getByRole("button", { name: "French options" }).click();
  await page.getByRole("menuitem", { name: "Project settings" }).click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);

  await page.getByLabel("Name").fill("Français");
  await page.getByLabel(/Custom instructions/).fill("Use emojis.");
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(
    page
      .getByRole("complementary")
      .getByRole("link", { name: "Français", exact: true }),
  ).toBeVisible();

  // The updated instructions reach the next reply (mock probe) — the
  // chat opens from the project page's own list.
  await page.getByRole("main").getByRole("link", { name: /Bonjour/ }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);
  await page.getByLabel("Message").fill("encore une fois");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByText(/Following your project instructions/).last(),
  ).toBeVisible();
  // And with “bonjour” saved, the tutor drills the learner's own word.
  await expect(page.getByText(/Try using/).last()).toBeVisible();
});

test("the tutor CRUDs vocabulary from chat: add, list, delete land in the table", async ({
  page,
}) => {
  // Mock grammar drives the SAME tool executor the real model calls —
  // this proves chat → DB, not just chat → words on screen.
  await page.goto("/study");
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Français", exact: true })
    .click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);
  await page.getByRole("main").getByRole("link", { name: /Bonjour/ }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  const send = async (text: string) => {
    await page.getByLabel("Message").fill(text);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByLabel("Message")).toBeFocused();
  };

  await send("add vocab: fromage — cheese");
  await expect(page.getByText(/added “fromage”/)).toBeVisible();

  // The word is real table data now, not chat prose.
  await page.goto("/study/vocab?book=all");
  const table = page.getByRole("main").locator("table");
  await expect(
    table.locator("tbody tr").filter({ hasText: "fromage" }),
  ).toBeVisible();

  // Back in the chat: list reads the same rows, delete removes them.
  await page.goBack();
  await send("list my vocab");
  await expect(page.getByText(/2 saved words: bonjour, fromage/)).toBeVisible();
  await send("delete vocab: fromage");
  await expect(page.getByText(/Removed “fromage”/)).toBeVisible();

  await page.goto("/study/vocab?book=all");
  await expect(
    table.locator("tbody tr").filter({ hasText: "fromage" }),
  ).toHaveCount(0);
});

test("memory: the tutor remembers across chats; the learner manages it on Account", async ({
  page,
}) => {
  // Same executor contract as the vocab tools: the mock grammar drives
  // remember/forget through the REAL tool executor, and "what do you
  // remember" answers from the INJECTED context — so this proves both
  // chat → DB and DB → next turn's prompt.
  await page.goto("/study");
  await page.getByRole("button", { name: "New chat" }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  const send = async (text: string) => {
    await page.getByLabel("Message").fill(text);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByLabel("Message")).toBeFocused();
  };

  await send("remember: Is preparing for the JLPT N3 exam in December");
  await expect(page.getByText("Got it — I'll remember that.")).toBeVisible();
  await send("remember: Prefers short drills over long explanations");
  await expect(
    page.getByText("Got it — I'll remember that.").nth(1),
  ).toBeVisible();

  // Injection probe: the reply reads the context block, not the DB.
  await send("what do you remember");
  await expect(
    page.getByText(/Here's what I remember about you:.*JLPT N3.*short drills/),
  ).toBeVisible();

  // Forgetting from chat removes the memory for the NEXT turn.
  await send("forget memory: short drills");
  await expect(page.getByText(/Forgotten:.*short drills/)).toBeVisible();

  // The surviving memory is visible + deletable on the Account page.
  await page.goto("/study/account");
  const memorySection = page
    .getByRole("main")
    .locator("section")
    .filter({ hasText: "Memory" });
  await expect(memorySection.getByText(/JLPT N3/)).toBeVisible();
  await expect(memorySection.getByText(/short drills/)).not.toBeVisible();

  // Two-step ConfirmButton: arm, then delete.
  const deleteButton = memorySection.getByTitle("Delete memory");
  await deleteButton.click();
  await deleteButton.click();
  await expect(memorySection.getByText(/JLPT N3/)).not.toBeVisible();
  await expect(memorySection.getByText(/Nothing saved yet/)).toBeVisible();

  // And the tutor's context is empty again on the next turn.
  await page.goto("/study");
  await page
    .getByRole("complementary")
    .getByRole("link", { name: /^remember: Is preparing/ })
    .click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);
  await send("what do you remember");
  await expect(
    page.getByText("I don't have any memories saved about you yet."),
  ).toBeVisible();
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

  // Deletion lives behind the header's single ⋯ menu now.
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Chat options" }).click();
  await page.getByRole("menuitem", { name: "Delete chat" }).click();
  await page.waitForURL(/\/study$/);
  await expect(
    page.getByRole("complementary").getByRole("link", { name: /help me plan/ }),
  ).not.toBeVisible();
});

test("branch in new chat copies the conversation up to that reply", async ({
  page,
}) => {
  // The French thread carries 4 turns by now (Bonjour + reply, encore +
  // reply). Branching from the FIRST reply must copy exactly two.
  await page.goto("/study");
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Français", exact: true })
    .click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);
  const projectUrl = page.url();
  await page.getByRole("main").getByRole("link", { name: /Bonjour/ }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);
  const sourceUrl = page.url();
  const sourceThread = new URL(sourceUrl).searchParams.get("t");

  const firstReply = page
    .getByRole("main")
    .getByText(/Let's practice your/)
    .first();
  await firstReply.hover();
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Branch in new chat" }).click();
  // The current URL already matches /study?t=… — wait for the thread id
  // to actually CHANGE, not just for the pattern.
  await page.waitForURL(
    (url) =>
      url.pathname === "/study" &&
      url.searchParams.get("t") !== null &&
      url.searchParams.get("t") !== sourceThread,
  );

  // The copied prefix is there; everything after the cut point is not.
  // (.first(): the title, the user bubble, and the reply's quote of it
  // all contain the phrase.)
  const main = page.getByRole("main");
  await expect(main.getByText(/Je veux apprendre/).first()).toBeVisible();
  await expect(main.getByText(/Let's practice your/).first()).toBeVisible();
  await expect(main.getByText(/encore une fois/)).not.toBeVisible();

  // Both threads live on — the project page now lists the pair.
  await page.goto(projectUrl);
  await expect(
    page.getByRole("main").getByRole("link", { name: /Bonjour/ }),
  ).toHaveCount(2);
});

test("desktop: chat chrome spans the pane while the column stays readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto("/study");
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Français", exact: true })
    .click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);
  await page
    .getByRole("main")
    .getByRole("link", { name: /Bonjour/ })
    .first()
    .click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  const main = await page.getByRole("main").boundingBox();
  const header = await page.locator("main header").boundingBox();
  const composer = await page.getByLabel("Message").boundingBox();
  expect(main && header && composer).toBeTruthy();

  // Header (chrome) bleeds edge to edge of the pane…
  expect(header!.width).toBeGreaterThan(main!.width - 2);
  // …while the composer column is capped (max-w-3xl) and centered, so
  // messages don't stretch across a 1920px monitor.
  expect(composer!.width).toBeLessThanOrEqual(768);
  const mainCenter = main!.x + main!.width / 2;
  const composerCenter = composer!.x + composer!.width / 2;
  expect(Math.abs(mainCenter - composerCenter)).toBeLessThan(8);
});

test("deleting a project frees its chats instead of destroying them", async ({
  page,
}) => {
  await page.goto("/study");
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "New project" })
    .click();
  const projectDialog = page.getByRole("dialog");
  await projectDialog.getByLabel("Name").fill("Temp");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(projectDialog).not.toBeVisible();

  // A chat inside it (no message sent — stays "New chat").
  await page.getByRole("button", { name: "Start Temp chat" }).click();
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

test("sidebar chat row: rename inline, then delete from the ⋯ menu", async ({
  page,
}) => {
  // The Temp deletion above left an empty loose "New chat" in the
  // sidebar — adopt it (the hero button reuses empty chats).
  await page.goto("/study");
  const sidebar = page.getByRole("complementary");
  const row = sidebar
    .locator("div.group")
    .filter({ has: page.getByRole("link", { name: "New chat" }) });
  await row.hover();
  await row.getByRole("button", { name: "New chat options" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Rename chat").fill("My renamed chat");
  await page.getByLabel("Rename chat").press("Enter");
  await expect(
    sidebar.getByRole("link", { name: "My renamed chat" }),
  ).toBeVisible();

  // Delete from the row menu — the row disappears, no navigation.
  page.on("dialog", (dialog) => void dialog.accept());
  const renamed = sidebar
    .locator("div.group")
    .filter({ has: page.getByRole("link", { name: "My renamed chat" }) });
  await renamed.hover();
  await renamed
    .getByRole("button", { name: "My renamed chat options" })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(
    sidebar.getByRole("link", { name: "My renamed chat" }),
  ).not.toBeVisible();
});

test("Ask dock: opens on any study page, chats, and closes on Escape", async ({
  page,
}) => {
  await page.goto("/study/vocab");
  await page.getByRole("button", { name: "Ask AI" }).click();

  // The dock hosts a real chat (thread created lazily) — send through it.
  await page.getByLabel("Message").fill("help me plan tomorrow");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Happy to help with anything/)).toBeVisible();

  // Escape closes; the launcher returns.
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Message")).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Ask AI" })).toBeVisible();
});

test("manual vocab add + SM-2 review session over the due deck", async ({
  page,
}) => {
  // Adding goes through the New word dialog — the landing stays a shelf.
  await page.goto("/study/vocab");
  await page.getByRole("button", { name: "New word" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Language").selectOption("Japanese");
  await dialog.getByLabel("Word or phrase").fill("猫");
  await dialog.getByLabel(/Reading/).fill("neko");
  await dialog.getByLabel("Meaning").fill("cat");
  await dialog.getByRole("button", { name: "Add word" }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/study/vocab?book=all");
  await expect(
    page.getByRole("main").getByRole("cell", { name: "猫", exact: true }),
  ).toBeVisible();

  // Both saved words are due (never reviewed) — review the whole deck.
  await page.goto("/study/vocab/review");
  await expect(page.getByText("Card 1 of 2")).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Show answer" }).click();
    await page.getByRole("button", { name: "Good" }).click();
  }
  await expect(page.getByText("2 cards reviewed")).toBeVisible();

  // Graded cards moved out of "due" — the landing's Review CTA is gone.
  await page.goto("/study/vocab");
  await expect(
    page.getByRole("link", { name: /Review \d+ due/ }),
  ).not.toBeVisible();
});

test("table: default columns, customization, quiz mode, sort, filter", async ({
  page,
}) => {
  await page.goto("/study/vocab?book=all");
  const main = page.getByRole("main");
  const table = main.locator("table");

  // Lean by default: Word/Reading/Meaning — no SRS noise, no Status.
  for (const col of ["Word", "Reading", "Meaning"]) {
    await expect(table.getByText(col, { exact: true })).toBeVisible();
  }
  await expect(table.getByText("Status", { exact: true })).not.toBeVisible();

  // Columns menu adds Language; the header appears.
  await main.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitem", { name: "Language" }).click();
  await page.keyboard.press("Escape");
  await expect(table.getByText("Language", { exact: true })).toBeVisible();
  // Put it back for later tests (the choice persists in localStorage).
  await main.getByRole("button", { name: "Columns" }).click();
  await page.getByRole("menuitem", { name: "Language" }).click();
  await page.keyboard.press("Escape");

  // Quiz mode hides meanings; tapping the row reveals just that row.
  await main.getByRole("button", { name: "Quiz" }).click();
  const catCell = table.getByRole("cell", { name: "cat", exact: true });
  await expect(catCell).not.toBeVisible();
  await table.locator("tbody tr").filter({ hasText: "猫" }).click();
  await expect(catCell).toBeVisible();
  await main.getByRole("button", { name: "Quiz" }).click();

  // Default order = newest first (猫 after bonjour); Word sorts it.
  const terms = table.locator("tbody tr td:first-child");
  await expect(terms.first()).toHaveText("猫");
  await table.getByRole("button", { name: "Word" }).click();
  await expect(terms.first()).toHaveText("bonjour");

  // The language filter narrows to one language.
  await main.getByLabel("Filter language").selectOption("Japanese");
  await expect(
    table.getByRole("cell", { name: "bonjour", exact: true }),
  ).not.toBeVisible();
  await expect(
    table.getByRole("cell", { name: "猫", exact: true }),
  ).toBeVisible();
  await main.getByLabel("Filter language").selectOption("all");
  await expect(
    table.getByRole("cell", { name: "bonjour", exact: true }),
  ).toBeVisible();
});

test("editing via the row menu updates a word and survives reload", async ({
  page,
}) => {
  await page.goto("/study/vocab?book=all");
  const table = page.getByRole("main").locator("table");
  const row = table.locator("tbody tr").filter({ hasText: "猫" });
  await row.hover();
  await row.getByRole("button", { name: "猫 options" }).click();
  await page.getByRole("menuitem", { name: "Edit word" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Word or phrase")).toHaveValue("猫");
  await dialog.getByLabel("Meaning").fill("cat (animal)");
  await dialog.getByRole("button", { name: "Save word" }).click();
  await expect(
    table.getByRole("cell", { name: /cat \(animal\)/ }),
  ).toBeVisible();

  // Persisted, not just local state.
  await page.reload();
  await expect(
    table.getByRole("cell", { name: /cat \(animal\)/ }),
  ).toBeVisible();
});

test("CSV export serves the personal list Anki-ready", async ({ page }) => {
  await page.goto("/study/vocab?book=all");
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

test("edit dialog: Escape cancels, Enter saves; delete confirms from the row menu", async ({
  page,
}) => {
  // A throwaway word, so this test leaves the list exactly as it found it.
  await page.goto("/study/vocab");
  await page.getByRole("button", { name: "New word" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByLabel("Language").selectOption("Spanish");
  await addDialog.getByLabel("Word or phrase").fill("perro");
  await addDialog.getByLabel("Meaning").fill("dog");
  await addDialog.getByRole("button", { name: "Add word" }).click();
  await expect(addDialog).not.toBeVisible();

  await page.goto("/study/vocab?book=all");
  const table = page.getByRole("main").locator("table");
  const row = () => table.locator("tbody tr").filter({ hasText: "perro" });
  const openEdit = async () => {
    await row().hover();
    await row().getByRole("button", { name: "perro options" }).click();
    await page.getByRole("menuitem", { name: "Edit word" }).click();
  };

  // Escape abandons the edit — the original meaning survives.
  await openEdit();
  await page.getByLabel("Meaning").fill("cat");
  await page.getByLabel("Meaning").press("Escape");
  await expect(row()).toContainText("dog");
  await expect(row()).not.toContainText("cat");

  // Enter commits without reaching for the mouse.
  await openEdit();
  await page.getByLabel("Meaning").fill("dog (Spanish)");
  await page.getByLabel("Meaning").press("Enter");
  await expect(row()).toContainText("dog (Spanish)");

  // Delete asks for confirmation from the row menu.
  page.on("dialog", (dialog) => void dialog.accept());
  await row().hover();
  await row().getByRole("button", { name: "perro options" }).click();
  await page.getByRole("menuitem", { name: "Delete word" }).click();
  await expect(row()).toHaveCount(0);
});

test("categories filter the table; save-as-book, reorder, remove", async ({
  page,
}) => {
  await page.goto("/study/vocab");

  // Three categorized words — two verbs, one noun — via the dialog.
  const add = async (term: string, meaning: string, category: string) => {
    await page.getByRole("button", { name: "New word" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Language").selectOption("French");
    await dialog.getByLabel("Word or phrase").fill(term);
    await dialog.getByLabel("Meaning").fill(meaning);
    await dialog.getByLabel("Type").selectOption(category);
    await dialog.getByRole("button", { name: "Add word" }).click();
    await expect(dialog).not.toBeVisible();
  };
  await add("aller", "to go", "Verb");
  await add("faire", "to do", "Verb");
  await add("gare", "station", "Noun");

  // The type filter narrows the table to verbs.
  await page.goto("/study/vocab?book=all");
  const main = page.getByRole("main");
  const table = main.locator("table");
  await main.getByLabel("Filter type").selectOption("Verb");
  await expect(table.getByRole("cell", { name: "gare" })).not.toBeVisible();
  await expect(
    table.getByRole("cell", { name: "aller", exact: true }),
  ).toBeVisible();

  // Save the filtered view as a book.
  await main.getByRole("button", { name: "Save as book" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Book name").fill("Mes verbes");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();

  // The book is on the shelf; open it — manual order, no gare.
  await page.goto("/study/vocab");
  await main.getByRole("link", { name: /Mes verbes/ }).click();
  await page.waitForURL(/book=/);
  const rows = table.locator("tbody tr");
  await expect(table.getByRole("cell", { name: "gare" })).not.toBeVisible();

  // Manual reorder: view order was newest-first (faire before aller) —
  // move aller up and it takes the top row.
  await expect(rows.first()).toContainText("faire");
  await rows.filter({ hasText: "aller" }).getByTitle("Move up").click();
  await expect(rows.first()).toContainText("aller");

  // Removing from the book never deletes the word itself.
  const faireRow = rows.filter({ hasText: "faire" });
  await faireRow.hover();
  await faireRow.getByRole("button", { name: "faire options" }).click();
  await page.getByRole("menuitem", { name: "Remove from book" }).click();
  await expect(
    table.getByRole("cell", { name: "faire", exact: true }),
  ).not.toBeVisible();
  await page.goto("/study/vocab?book=all");
  await expect(
    table.getByRole("cell", { name: "faire", exact: true }),
  ).toBeVisible();

  // Order + membership are server state — they survive a fresh visit.
  await page.goto("/study/vocab");
  await main.getByRole("link", { name: /Mes verbes/ }).click();
  await page.waitForURL(/book=/);
  await expect(rows.first()).toContainText("aller");
  await expect(table.getByRole("cell", { name: "faire" })).not.toBeVisible();
});

test("pinned book: sidebar row opens it, + quick-adds a word into it", async ({
  page,
}) => {
  // Pin "Mes verbes" from the shelf's row menu.
  await page.goto("/study/vocab");
  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Mes verbes options" }).click();
  await page.getByRole("menuitem", { name: "Pin to sidebar" }).click();

  const sidebar = page.getByRole("complementary");
  const bookRow = sidebar
    .locator("div.group")
    .filter({ has: page.getByRole("link", { name: /Mes verbes/ }) });
  await expect(bookRow).toBeVisible();

  // Quick-add straight into the book from the sidebar's + button.
  await bookRow.hover();
  await bookRow.getByRole("button", { name: "Add word to Mes verbes" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Language").selectOption("French");
  await dialog.getByLabel("Word or phrase").fill("manger");
  await dialog.getByLabel("Meaning").fill("to eat");
  await dialog.getByRole("button", { name: "Add word" }).click();
  await expect(dialog).not.toBeVisible();

  // The sidebar row opens the book — the new word is at the end.
  await sidebar.getByRole("link", { name: /Mes verbes/ }).click();
  await page.waitForURL(/book=/);
  const table = page.getByRole("main").locator("table");
  await expect(
    table.locator("tbody tr").filter({ hasText: "manger" }),
  ).toBeVisible();

  // Unpin from the shelf — the sidebar row leaves.
  await page.goto("/study/vocab");
  await main.getByRole("button", { name: "Mes verbes options" }).click();
  await page.getByRole("menuitem", { name: "Unpin from sidebar" }).click();
  await expect(
    sidebar.getByRole("link", { name: /Mes verbes/ }),
  ).not.toBeVisible();
});

test("curated packs: browse, add one word, import all as a personal list", async ({
  page,
}) => {
  await page.goto("/study/packs");
  await expect(
    page.getByRole("heading", { name: "Curated lists" }),
  ).toBeVisible();
  await expect(page.getByText("Persona 5 essentials")).toBeVisible();

  await page.getByRole("link", { name: /Café survival French/ }).click();
  await page.waitForURL("**/study/packs/cafe-french");

  // One word first — the row flips to its "in your dictionary" state.
  await page
    .getByRole("button", { name: "Add commander to my dictionary" })
    .click();
  await expect(
    page.getByRole("button", { name: "commander is in your dictionary" }),
  ).toBeVisible();
  await page.goto("/study/vocab?book=all");
  const main = page.getByRole("main");
  const table = main.locator("table");
  await expect(
    table.locator("tbody tr").filter({ hasText: "commander" }),
  ).toBeVisible();

  // Whole pack: every missing word joins + it lands on the SHELF as the
  // learner's own book.
  await page.goto("/study/packs/cafe-french");
  await page
    .getByRole("button", { name: "Add all to my vocabulary" })
    .click();
  await expect(page.getByText(/saved the pack as your/)).toBeVisible();

  await page.goto("/study/vocab");
  await main.getByRole("link", { name: /Café survival French/ }).click();
  await page.waitForURL(/book=/);
  await expect(
    table.locator("tbody tr").filter({ hasText: "l'addition" }),
  ).toBeVisible();
  await expect(
    table.locator("tbody tr").filter({ hasText: "une noisette" }),
  ).toBeVisible();
});

test("chat→vocab bulk extraction: review dialog, bulk save, dedup", async ({
  page,
}) => {
  // A German project: its vocab list is empty, so the mock tutor
  // suggests its starter word as a VOCAB line.
  await page.goto("/study");
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "New project" })
    .click();
  const projectDialog = page.getByRole("dialog");
  await projectDialog.getByLabel("Name").fill("German");
  await projectDialog.getByLabel(/Language/).selectOption("German");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(projectDialog).not.toBeVisible();

  await page.getByRole("button", { name: "Start German chat" }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);
  const threadUrl = page.url();

  // One send — counts against the suite's shared cap budget.
  await page.getByLabel("Message").fill("Guten Tag! Ich lerne Deutsch.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Let's practice your German/)).toBeVisible();

  // The tutor marked a word; do NOT tap its chip — extraction must find
  // it by reading the transcript (via the header's ⋯ menu).
  await page.getByRole("button", { name: "Chat options" }).click();
  await page
    .getByRole("menuitem", { name: "Save words from this chat" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("bonjour")).toBeVisible();
  await dialog.getByRole("button", { name: "Add 1 word" }).click();
  await expect(dialog.getByText(/Added 1 word/)).toBeVisible();
  await dialog.getByRole("link", { name: /Open my vocabulary/ }).click();

  // Filed under German (bonjour also exists under French — the term
  // dedup is per language): the German language filter still shows it.
  await page.waitForURL("**/study/vocab");
  await page.goto("/study/vocab?book=all");
  await page.getByLabel("Filter language").selectOption("German");
  await expect(
    page.getByRole("main").locator("tbody tr").filter({ hasText: "bonjour" }),
  ).toBeVisible();

  // Round 2 proves dedup: the word is on the list now, so extraction
  // comes back empty instead of proposing it again.
  await page.goto(threadUrl);
  await page.getByRole("button", { name: "Chat options" }).click();
  await page
    .getByRole("menuitem", { name: "Save words from this chat" })
    .click();
  await expect(
    page.getByRole("dialog").getByText(/No new words found/),
  ).toBeVisible();
});

test("free daily cap blocks the tutor and points at the upgrade", async ({
  page,
}) => {
  await page.goto("/study");
  // Reuse the French thread via its project page (project chats aren't
  // sidebar rows). 4 of the 5 free messages are already spent.
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Français", exact: true })
    .click();
  await page.waitForURL(/\/study\/project\/[0-9a-f-]{36}/);
  await page
    .getByRole("main")
    .getByRole("link", { name: /Bonjour/ })
    .first()
    .click();
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
  await expect(page.getByText(/of 15 tutor messages/)).toBeVisible();
  await expect(page.getByText(/Billing is not configured/)).toBeVisible();
  // Models card names the roster.
  await expect(page.getByText("gpt-5.6-terra")).toBeVisible();
  await expect(page.getByText("gpt-5.6-sol")).toBeVisible();
});
