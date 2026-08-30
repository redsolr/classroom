import { expect, test, type Page } from "@playwright/test";
import { resetMockLearner, sendMessage } from "./helpers";

/**
 * The self-study space (/chat): projects with custom instructions
 * (ChatGPT-Projects shape), tutor chat in language projects (offline
 * mock tutor — demonstrably grounded in the learner's vocab), generic
 * loose chats, the personal vocabulary loop (chip-add, manual add, SM-2
 * review), and the free-tier daily cap (STUDY_FREE_DAILY_CAP=20 set by
 * playwright.config for this suite — the tool/dock/memory tests all
 * spend from the same rolling-24h budget).
 *
 * The mock learner accumulates rows across local runs (persistent
 * Postgres, fixed mock identity), so the suite resets that learner
 * up-front — same idempotence idea as `db:seed` re-wiping the demo
 * teacher.
 */

const FREE_CAP = 20;

test.beforeAll(resetMockLearner);

test("study space opens straight into the composer — no extra step", async ({
  page,
}) => {
  await page.goto("/chat");
  // The landing IS the chat window (ChatGPT shape): the composer is
  // ready immediately, no hero button between the learner and typing.
  await expect(page.getByLabel("Message")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});

test("project with custom instructions: instructions reach the reply, chips carry their own language", async ({
  page,
}) => {
  // New project is a DIALOG (ChatGPT shape): create → it closes, the
  // folder lands in the sidebar, and the learner stays put — no
  // redirect to a settings page. Projects are GENERIC (name +
  // instructions, no language mode — 2026-08-14 refactor).
  await page.goto("/chat");
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "New project" })
    .click();
  const projectDialog = page.getByRole("dialog");
  await projectDialog.getByLabel("Name").fill("French");
  await projectDialog
    .getByLabel(/Custom instructions/)
    .fill("Always be brief.");
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(projectDialog).not.toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/chat");

  // A chat started from the new folder inherits the instructions.
  await page.getByRole("button", { name: "Start French chat" }).click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);

  await page.getByLabel("Message").fill("Bonjour! Je veux apprendre.");
  await page.getByRole("button", { name: "Send" }).click();

  // Mock tutor: the instructions-reached-the-prompt probe.
  await expect(page.getByText(/A good word to start your list/)).toBeVisible();
  await expect(
    page.getByText(/Following your project instructions/),
  ).toBeVisible();

  // The suggested word rides a VOCAB line CARRYING ITS OWN LANGUAGE —
  // the chip files it under French with no project mode anywhere.
  const chip = page.getByRole("button", { name: /bonjour — hello/ });
  await expect(chip).toBeVisible();
  await chip.click();
  // Wait for the SAVED state, not just disabled — the chip also disables
  // while the action is in flight, and navigating away at that moment
  // aborts the save (this exact race flaked the suite).
  await expect(chip).toHaveAttribute("title", "Added to your vocabulary");
  await expect(chip).toBeDisabled();

  // The saved word is a row in the All-words table.
  await page.goto("/decks/all");
  await expect(
    page.getByRole("main").locator("tbody tr").filter({ hasText: "bonjour" }),
  ).toBeVisible();
});

test("a loose chat is generic: no tutor persona, no instructions tail", async ({
  page,
}) => {
  // Draft chat: type straight into the landing composer — the thread is
  // created on the first send and the URL follows without a navigation.
  await page.goto("/chat");
  await page.getByLabel("Message").fill("help me plan my week");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/Happy to help with anything/)).toBeVisible();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);
  // No project → no instructions tail, and nothing suggested a chip.
  await expect(
    page.getByText(/Following your project instructions/),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /bonjour — hello/ }),
  ).not.toBeVisible();
});

test("pin from the chat header floats the chat into Pinned; unpin returns it home", async ({
  page,
}) => {
  // Project chats live on the PROJECT PAGE, not the sidebar (ChatGPT
  // shape) — so pinning happens from the chat header's ⋯ menu.
  await page.goto("/chat");
  const sidebar = page.getByRole("complementary");
  await sidebar.getByRole("link", { name: "French", exact: true }).click();
  await page.waitForURL(/\/project\/[0-9a-f-]{36}/);
  await page.getByRole("main").getByRole("link", { name: /Bonjour/ }).click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);

  // Scoped to the desktop header — the same ⋯ menu also exists in the
  // (hidden) mobile navbar slot.
  await page
    .locator(".chat-header")
    .getByRole("button", { name: "Chat options" })
    .click();
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
  await page.goto("/chat");
  // Settings live behind the project row's ⋯ menu (the label navigates).
  await page.getByRole("button", { name: "French options" }).click();
  await page.getByRole("menuitem", { name: "Project settings" }).click();
  await page.waitForURL(/\/project\/[0-9a-f-]{36}/);

  // The page leads with chats; the settings form is behind its button.
  await page.getByRole("button", { name: "Settings" }).click();
  const settingsDialog = page.getByRole("dialog");
  await settingsDialog.getByLabel("Name").fill("Français");
  await settingsDialog.getByLabel(/Custom instructions/).fill("Use emojis.");
  await settingsDialog.getByRole("button", { name: "Save project" }).click();
  await expect(settingsDialog).not.toBeVisible();
  await expect(
    page
      .getByRole("complementary")
      .getByRole("link", { name: "Français", exact: true }),
  ).toBeVisible();

  // The updated instructions reach the next reply (mock probe) — the
  // chat opens from the project page's own list.
  await page.getByRole("main").getByRole("link", { name: /Bonjour/ }).click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);
  // "drill me" probes that the learner's vocabulary (bonjour, saved in
  // the first test) is injected — with NO language mode on the chat.
  await page.getByLabel("Message").fill("drill me");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page.getByText(/Following your project instructions/).last(),
  ).toBeVisible();
  await expect(page.getByText(/Try using/).last()).toBeVisible();
});

test("the tutor CRUDs vocabulary from chat: add, list, delete land in the table", async ({
  page,
}) => {
  // Mock grammar drives the SAME tool executor the real model calls —
  // this proves chat → DB, not just chat → words on screen.
  await page.goto("/chat");
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Français", exact: true })
    .click();
  await page.waitForURL(/\/project\/[0-9a-f-]{36}/);
  await page.getByRole("main").getByRole("link", { name: /Bonjour/ }).click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);

  const send = (text: string) => sendMessage(page, text);

  // The word names its OWN language — the chat has no language mode.
  await send("add vocab: fromage — cheese — French");
  await expect(page.getByText(/added “fromage”/)).toBeVisible();

  // The word is real table data now, not chat prose.
  await page.goto("/decks/all");
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

  await page.goto("/decks/all");
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
  await page.goto("/chat");
  const send = (text: string) => sendMessage(page, text);

  await send("remember: Is preparing for the JLPT N3 exam in December");
  await expect(page.getByText("Got it — I'll remember that.")).toBeVisible();
  // The first send hands the draft off to the server-rendered thread
  // view (a remount that resets the composer) — wait for its header
  // before typing message #2.
  await expect(page.locator(".chat-header")).toBeVisible();
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
  await page.goto("/account");
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
  await page.goto("/chat");
  await page
    .getByRole("complementary")
    .getByRole("link", { name: /^remember: Is preparing/ })
    .click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);
  await send("what do you remember");
  await expect(
    page.getByText("I don't have any memories saved about you yet."),
  ).toBeVisible();
});

test("About-you instructions inject everywhere; pausing memory stops saving AND using it", async ({
  page,
}) => {
  // Standing instructions (ChatGPT Custom Instructions shape) reach the
  // next reply's prompt assembly — proved by the mock's probe tail.
  await page.goto("/account");
  const instructions = page.getByLabel("Standing instructions");
  const saveInstructions = async () => {
    // Reloading the instant after click aborts the in-flight server
    // action (the vocab-chip race all over again) — wait for the
    // action's POST to answer before moving on.
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          res.url().includes("/account"),
      ),
      page.getByRole("button", { name: "Save instructions" }).click(),
    ]);
  };
  await instructions.fill("Answer briefly.");
  await saveInstructions();
  // Reload proves the row persisted (an uncontrolled textarea would
  // keep the typed value even if the save silently failed).
  await page.reload();
  await expect(instructions).toHaveValue("Answer briefly.");

  await page.goto("/chat");
  const send = (text: string) => sendMessage(page, text);

  await send("hello there");
  await expect(
    page.getByText(/Following your standing instructions/),
  ).toBeVisible();
  // Draft → thread remount marker (see the memory test above).
  await expect(page.locator(".chat-header")).toBeVisible();

  await send("remember: Collects mechanical watches");
  await expect(page.getByText("Got it — I'll remember that.")).toBeVisible();

  // ── Pause: saved rows are KEPT but neither injected nor added to ──
  await page.goto("/account");
  await page.getByRole("button", { name: "Pause memory" }).click();
  await expect(page.getByText(/Memory is paused/)).toBeVisible();
  // The saved memory survives the pause, visibly.
  await expect(
    page.getByRole("main").getByText(/Collects mechanical watches/),
  ).toBeVisible();

  await page.goto("/chat");
  await page
    .getByRole("complementary")
    .getByRole("link", { name: /^hello there/ })
    .click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);
  // Injection is off: the context probe sees no memories…
  await send("what do you remember");
  await expect(
    page.getByText("I don't have any memories saved about you yet."),
  ).toBeVisible();
  // …and saving is off: the remember tool refuses.
  await send("remember: A fact that must not stick");
  await expect(page.getByText(/Memory is paused — /)).toBeVisible();

  // ── Resume, then Delete all clears the list ───────────────────────
  await page.goto("/account");
  await page.getByRole("button", { name: "Resume memory" }).click();
  await expect(page.getByText(/Memory is paused/)).not.toBeVisible();
  await expect(
    page.getByRole("main").getByText(/A fact that must not stick/),
  ).not.toBeVisible();

  const deleteAll = page.getByTitle("Delete all memories");
  await deleteAll.click();
  await deleteAll.click();
  await expect(page.getByText(/Nothing saved yet/)).toBeVisible();

  // Leave no standing instructions behind for later tests.
  await instructions.fill("");
  await saveInstructions();
  await expect(instructions).toHaveValue("");
});

test("deleting a chat removes it after the confirm dialog", async ({
  page,
}) => {
  await page.goto("/chat");
  const loose = page
    .getByRole("complementary")
    .getByRole("link", { name: /help me plan/ });
  await loose.click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);

  // Deletion lives behind the header's single ⋯ menu now.
  page.on("dialog", (dialog) => void dialog.accept());
  // Scoped to the desktop header — the same ⋯ menu also exists in the
  // (hidden) mobile navbar slot.
  await page
    .locator(".chat-header")
    .getByRole("button", { name: "Chat options" })
    .click();
  await page.getByRole("menuitem", { name: "Delete chat" }).click();
  await page.waitForURL(/\/chat$/);
  await expect(
    page.getByRole("complementary").getByRole("link", { name: /help me plan/ }),
  ).not.toBeVisible();
});

test("branch in new chat copies the conversation up to that reply", async ({
  page,
}) => {
  // The French thread carries 4 turns by now (Bonjour + reply, drill me
  // + reply). Branching from the FIRST reply must copy exactly two.
  await page.goto("/chat");
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Français", exact: true })
    .click();
  await page.waitForURL(/\/project\/[0-9a-f-]{36}/);
  const projectUrl = page.url();
  await page.getByRole("main").getByRole("link", { name: /Bonjour/ }).click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);
  const sourceUrl = page.url();
  const sourceThread = new URL(sourceUrl).searchParams.get("t");

  const firstReply = page
    .getByRole("main")
    .getByText(/A good word to start your list/)
    .first();
  await firstReply.hover();
  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Branch in new chat" }).click();
  // The current URL already matches /chat?t=… — wait for the thread id
  // to actually CHANGE, not just for the pattern.
  await page.waitForURL(
    (url) =>
      url.pathname === "/chat" &&
      url.searchParams.get("t") !== null &&
      url.searchParams.get("t") !== sourceThread,
  );

  // The copied prefix is there; everything after the cut point is not.
  // (.first(): the title, the user bubble, and the reply's quote of it
  // all contain the phrase.)
  const main = page.getByRole("main");
  await expect(main.getByText(/Je veux apprendre/).first()).toBeVisible();
  await expect(
    main.getByText(/A good word to start your list/).first(),
  ).toBeVisible();
  await expect(main.getByText(/drill me/)).not.toBeVisible();

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
  await page.goto("/chat");
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Français", exact: true })
    .click();
  await page.waitForURL(/\/project\/[0-9a-f-]{36}/);
  await page
    .getByRole("main")
    .getByRole("link", { name: /Bonjour/ })
    .first()
    .click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);

  const main = await page.getByRole("main").boundingBox();
  const header = await page.locator(".chat-header").boundingBox();
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
  await page.goto("/chat");
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
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);
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
  await page.waitForURL(/\/chat$/);

  // The chat survived — now a loose chat in the sidebar. (div.group =
  // thread rows; the nav's own "New chat" tab is not one.)
  await expect(
    page
      .getByRole("complementary")
      .locator("div.group")
      .getByRole("link", { name: "New chat" }),
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
  await page.goto("/chat");
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
  await page.goto("/books");
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
  // Adding goes through the New word dialog, which lives on the DECK
  // page — /books is the shelf of containers now.
  await page.goto("/decks/all");
  await page.getByRole("button", { name: "New word" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Language").selectOption("Japanese");
  await dialog.getByLabel("Word or phrase").fill("猫");
  await dialog.getByLabel(/Reading/).fill("neko");
  await dialog.getByLabel("Meaning").fill("cat");
  await dialog.getByRole("button", { name: "Add word" }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto("/decks/all");
  await expect(
    page.getByRole("main").getByRole("cell", { name: "猫", exact: true }),
  ).toBeVisible();

  // Both saved words are due (never reviewed) — review the whole deck.
  await page.goto("/decks?book=all");
  await expect(page.getByText("Card 1 of 2")).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Show answer" }).click();
    await page.getByRole("button", { name: "Good" }).click();
  }
  await expect(page.getByText("2 cards reviewed")).toBeVisible();

  // Graded cards moved out of "due" — the deck's Review CTA is gone.
  await page.goto("/decks/all");
  await expect(
    page.getByRole("link", { name: /Review \d+/ }),
  ).not.toBeVisible();
});

test("table: default columns, customization, quiz mode, sort, filter", async ({
  page,
}) => {
  await page.goto("/decks/all");
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
  await page.goto("/decks/all");
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
  await page.goto("/decks/all");
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();

  const res = await page.request.get("/books/export.csv");
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
  await page.goto("/books");
  await page.getByRole("button", { name: "New word" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByLabel("Language").selectOption("Spanish");
  await addDialog.getByLabel("Word or phrase").fill("perro");
  await addDialog.getByLabel("Meaning").fill("dog");
  await addDialog.getByRole("button", { name: "Add word" }).click();
  await expect(addDialog).not.toBeVisible();

  await page.goto("/decks/all");
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
  await page.goto("/books");

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
  await page.goto("/decks/all");
  const main = page.getByRole("main");
  const table = main.locator("table");
  await main.getByLabel("Filter type").selectOption("Verb");
  await expect(table.getByRole("cell", { name: "gare" })).not.toBeVisible();
  await expect(
    table.getByRole("cell", { name: "aller", exact: true }),
  ).toBeVisible();

  // Save the filtered view as a book.
  await main.getByRole("button", { name: "Save as deck" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Deck name").fill("Mes verbes");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).not.toBeVisible();

  // The deck is on the shelf; open it — manual order, no gare. It is a
  // DECK, so it lives in the deck list under the book shelf and opens at
  // /decks/<id> rather than the old ?book= filter over this page.
  await page.goto("/books");
  await page.locator(".decks-shelf").getByRole("link", { name: /Mes verbes/ }).click();
  await page.waitForURL(/\/decks\/[0-9a-f-]{36}$/);
  const rows = table.locator("tbody tr");
  await expect(table.getByRole("cell", { name: "gare" })).not.toBeVisible();

  // Manual reorder: view order was newest-first (faire before aller) —
  // DRAG aller (by its grip handle) above faire and it takes the top
  // row. dnd-kit's pointer sensor needs real mouse moves with steps;
  // a single-hop dragTo doesn't clear the activation distance.
  await expect(rows.first()).toContainText("faire");
  const grip = rows.filter({ hasText: "aller" }).getByLabel("Reorder aller");
  const from = (await grip.boundingBox())!;
  const to = (await rows.filter({ hasText: "faire" }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 12 });
  await page.mouse.up();
  await expect(rows.first()).toContainText("aller");

  // Removing from the book never deletes the word itself.
  const faireRow = rows.filter({ hasText: "faire" });
  await faireRow.hover();
  await faireRow.getByRole("button", { name: "faire options" }).click();
  await page.getByRole("menuitem", { name: "Remove from book" }).click();
  await expect(
    table.getByRole("cell", { name: "faire", exact: true }),
  ).not.toBeVisible();
  await page.goto("/decks/all");
  await expect(
    table.getByRole("cell", { name: "faire", exact: true }),
  ).toBeVisible();

  // Order + membership are server state — they survive a fresh visit.
  await page.goto("/books");
  await page.locator(".decks-shelf").getByRole("link", { name: /Mes verbes/ }).click();
  await page.waitForURL(/\/decks\/[0-9a-f-]{36}$/);
  await expect(rows.first()).toContainText("aller");
  await expect(table.getByRole("cell", { name: "faire" })).not.toBeVisible();
});

test("pinned book: sidebar row opens it, + quick-adds a word into it", async ({
  page,
}) => {
  // Pin "Mes verbes" from the shelf's row menu.
  await page.goto("/books");
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

  // The sidebar row opens the deck — the new word is at the end.
  await sidebar.getByRole("link", { name: /Mes verbes/ }).click();
  await page.waitForURL(/\/decks\/[0-9a-f-]{36}$/);
  const table = page.getByRole("main").locator("table");
  await expect(
    table.locator("tbody tr").filter({ hasText: "manger" }),
  ).toBeVisible();

  // Unpin from the shelf — the sidebar row leaves.
  await page.goto("/books");
  await main.getByRole("button", { name: "Mes verbes options" }).click();
  await page.getByRole("menuitem", { name: "Unpin from sidebar" }).click();
  await expect(
    sidebar.getByRole("link", { name: /Mes verbes/ }),
  ).not.toBeVisible();
});

test("curated packs: browse, add one word, import all as a personal list", async ({
  page,
}) => {
  await page.goto("/official");
  await expect(
    page.getByRole("heading", { name: "Official books" }),
  ).toBeVisible();
  await expect(page.getByText("Persona 5 essentials")).toBeVisible();

  await page.getByRole("link", { name: /Café survival French/ }).click();
  await page.waitForURL("**/official/cafe-french");

  // One word first — the heart flips to its liked state, and back:
  // liking is a TOGGLE, and a word with no progress and no book unlikes
  // without a confirm.
  await page
    .getByRole("button", { name: "Save commander to my vocabulary" })
    .click();
  const commanderHeart = page.getByRole("button", {
    name: "Remove commander from my vocabulary",
  });
  await expect(commanderHeart).toBeVisible();
  await commanderHeart.click();
  await expect(
    page.getByRole("button", { name: "Save commander to my vocabulary" }),
  ).toBeVisible();
  // Like it again — the rest of the test needs it saved.
  await page
    .getByRole("button", { name: "Save commander to my vocabulary" })
    .click();
  await expect(commanderHeart).toBeVisible();

  await page.goto("/decks/all");
  const main = page.getByRole("main");
  const table = main.locator("table");
  await expect(
    table.locator("tbody tr").filter({ hasText: "commander" }),
  ).toBeVisible();

  // Whole pack: every missing word joins + it lands on the SHELF as the
  // learner's own book.
  await page.goto("/official/cafe-french");
  await page
    .getByRole("button", { name: "Save as my book" })
    .click();
  await expect(page.getByText(/saved the pack as your/)).toBeVisible();

  await page.goto("/books");
  // Importing a pack makes a DECK of the learner's own, so it lands in
  // the deck list rather than the book shelf. Scoped, because the
  // official cover shelf on the same page carries the same name.
  await page
    .locator(".decks-shelf")
    .getByRole("link", { name: /Café survival French/ })
    .click();
  await page.waitForURL(/\/decks\/[0-9a-f-]{36}$/);
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
  // A LOOSE GENERIC chat — extraction needs no language mode anymore;
  // the mock's VOCAB line carries the word's own language, exactly like
  // the real model is instructed to.
  await page.goto("/chat");
  await sendMessage(page, "merci beaucoup!");
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);
  const threadUrl = page.url();
  await expect(page.getByText(/A word worth keeping/)).toBeVisible();

  // The tutor marked a word; do NOT tap its chip — extraction must find
  // it by reading the transcript (via the header's ⋯ menu).
  // Scoped to the desktop header — the same ⋯ menu also exists in the
  // (hidden) mobile navbar slot.
  await page
    .locator(".chat-header")
    .getByRole("button", { name: "Chat options" })
    .click();
  await page
    .getByRole("menuitem", { name: "Save words from this chat" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("merci")).toBeVisible();
  // The candidate row shows the language the word itself carries.
  await expect(dialog.getByText("· French")).toBeVisible();
  await dialog.getByRole("button", { name: "Add 1 word" }).click();
  await expect(dialog.getByText(/Added 1 word/)).toBeVisible();
  await dialog.getByRole("link", { name: /Open my vocabulary/ }).click();

  // Filed under French — from the WORD's language, no chat mode around.
  await page.waitForURL("**/books");
  await page.goto("/decks/all");
  await page.getByLabel("Filter language").selectOption("French");
  await expect(
    page.getByRole("main").locator("tbody tr").filter({ hasText: "merci" }),
  ).toBeVisible();

  // Round 2 proves dedup: the word is on the list now, so extraction
  // comes back empty instead of proposing it again.
  await page.goto(threadUrl);
  // Scoped to the desktop header — the same ⋯ menu also exists in the
  // (hidden) mobile navbar slot.
  await page
    .locator(".chat-header")
    .getByRole("button", { name: "Chat options" })
    .click();
  await page
    .getByRole("menuitem", { name: "Save words from this chat" })
    .click();
  await expect(
    page.getByRole("dialog").getByText(/No new words found/),
  ).toBeVisible();
});

test("move to project: sidebar row menu files a loose chat; header menu pulls it back", async ({
  page,
}) => {
  // A fresh loose chat born from the draft composer.
  await page.goto("/chat");
  await sendMessage(page, "move me into a folder");
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);

  const sidebar = page.getByRole("complementary");
  const row = sidebar
    .locator("div.group")
    .filter({ has: page.getByRole("link", { name: /move me into a folder/ }) });
  await expect(row).toBeVisible();

  // A destination folder.
  await sidebar.getByRole("button", { name: "New project" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Filing Cabinet");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog).not.toBeVisible();

  // Sidebar row ⋯ → Move to project ▸ Filing Cabinet.
  await row.hover();
  await row.getByRole("button", { name: /options/ }).click();
  await page.getByRole("menuitem", { name: "Move to project" }).click();
  await page.getByRole("menuitem", { name: "Filing Cabinet" }).click();

  // Project chats live on the PROJECT PAGE, not the sidebar (ChatGPT
  // shape) — the row leaves Chats and the chat lists under the project.
  await expect(
    sidebar.getByRole("link", { name: /move me into a folder/ }),
  ).not.toBeVisible();
  await sidebar
    .getByRole("link", { name: "Filing Cabinet", exact: true })
    .click();
  await page.waitForURL(/\/project\/[0-9a-f-]{36}/);
  const chatLink = page
    .getByRole("main")
    .getByRole("link", { name: /move me into a folder/ });
  await expect(chatLink).toBeVisible();

  // Open it — the header subtitle names the project; the header ⋯ menu
  // offers the way back out.
  await chatLink.click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);
  const header = page.locator(".chat-header");
  await expect(
    header.getByRole("link", { name: "Filing Cabinet" }),
  ).toBeVisible();
  await header.getByRole("button", { name: "Chat options" }).click();
  await page.getByRole("menuitem", { name: "Move to project" }).click();
  // Keyboard select (also covers the keyboard path): the header ⋯ sits
  // at the right viewport edge, so the submenu collision-flips LEFT
  // while Radix's pointer-grace area still faces right — a mouse
  // travelling to the item exits the grace area and closes the submenu
  // mid-click (flaked exactly there). Focus + Enter moves no pointer.
  const removeItem = page.getByRole("menuitem", {
    name: "Remove from project",
  });
  await expect(removeItem).toBeVisible();
  await removeItem.press("Enter");

  // Loose again: the subtitle drops the project link, the row returns.
  await expect(
    header.getByRole("link", { name: "Filing Cabinet" }),
  ).not.toBeVisible();
  await expect(
    sidebar.getByRole("link", { name: /move me into a folder/ }),
  ).toBeVisible();
});

test("drag-to-ask: selecting reply text grows an Ask pill that quotes it into the composer", async ({
  page,
}) => {
  await page.goto("/chat");
  await sendMessage(page, "tell me something quotable");
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);
  const reply = page.getByText(/Happy to help with anything/).last();
  await expect(reply).toBeVisible();

  // Double-click selects a word inside the reply — the pill appears
  // above the selection. Retried as a unit: the settled turn's
  // router.refresh() re-renders the transcript, and a dblclick landing
  // exactly on the DOM swap leaves the selection in a detached node
  // (the pill rightly ignores it) — a human would simply re-select.
  const pill = page.getByRole("button", { name: "Ask tutor" });
  await expect(async () => {
    await reply.dblclick();
    await expect(pill).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await pill.click();

  // The selection landed as a `>` quote, composer focused, pill gone.
  await expect(page.getByLabel("Message")).toHaveValue(/^> \w+/);
  await expect(page.getByLabel("Message")).toBeFocused();
  await expect(pill).not.toBeVisible();
});

test("review: swiping the revealed card right grades it Good, Tinder-style", async ({
  page,
}) => {
  // Guarantee at least one due card no matter what earlier tests graded.
  await page.goto("/books");
  await page.getByRole("button", { name: "New word" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Language").selectOption("Japanese");
  await dialog.getByLabel("Word or phrase").fill("犬");
  await dialog.getByLabel("Meaning").fill("dog");
  await dialog.getByRole("button", { name: "Add word" }).click();
  await expect(dialog).not.toBeVisible();

  await page.goto("/decks?book=all");
  const progress = page.locator(".review-progress");
  await expect(progress).toHaveText(/Card 1 of \d+/);
  const total = Number((await progress.textContent())!.match(/of (\d+)/)![1]);

  // Reveal happens IN PLACE: the grade row is on screen the whole time
  // (grading never requires revealing), and the term's measured rect
  // must not move by a single pixel.
  await expect(page.getByRole("button", { name: "Good" })).toBeEnabled();
  // Scoped to the TOP card — the under card renders the same CardFace.
  const term = page.locator(".review-card .review-card-front p").first();
  const termBefore = await term.boundingBox();
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(page.locator(".review-answer")).toBeVisible();
  expect(await term.boundingBox()).toEqual(termBefore);

  // Swipe right: the card follows the pointer, the Good badge shows
  // past the threshold, release grades and advances the deck.
  const box = await page.locator(".review-card").boundingBox();
  if (!box) throw new Error("review card not measurable");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 120, cy, { steps: 6 });
  await expect(page.locator(".review-swipe-badge")).toHaveText("Good");
  await page.mouse.move(cx + 170, cy, { steps: 4 });
  await page.mouse.up();

  if (total > 1) {
    await expect(progress).toHaveText(new RegExp(`Card 2 of ${total}`));
  } else {
    await expect(page.getByText(/1 card reviewed/)).toBeVisible();
  }
});

test("practice again: finishing the deck offers an SRS-neutral cram round", async ({
  page,
}) => {
  await page.goto("/decks?book=all");
  const progress = page.locator(".review-progress");

  // Finish whatever the due deck holds (grade buttons don't require
  // reveal, and clicks auto-wait while the fly-off disables them).
  if (await page.locator(".review-card").count()) {
    const total = Number(
      (await progress.textContent())!.match(/of (\d+)/)![1],
    );
    for (let i = 0; i < total; i++) {
      await page.getByRole("button", { name: "Good" }).click();
    }
    await expect(page.getByText(/cards? reviewed/)).toBeVisible();
    await page.getByRole("button", { name: "Practice again" }).click();
  } else {
    // Everything already graded by earlier tests — same offer, other label.
    await page.getByRole("button", { name: "Practice anyway" }).click();
  }

  // A shuffled cram deck deals through the same swipe UI, marked as
  // schedule-neutral.
  await expect(progress).toHaveText(/Card 1 of \d+/);
  await expect(page.getByText(/practice — doesn/)).toBeVisible();
  await page.getByRole("button", { name: "Good" }).click();

  // Cram never reschedules: nothing became due again. Asserted on the
  // DECK page, which is where the Review CTA lives now — /books is a
  // shelf of containers and carries no such link, so checking it there
  // would pass without testing anything.
  await page.goto("/decks/all");
  await expect(
    page.getByRole("link", { name: /Review \d+/ }),
  ).not.toBeVisible();
});

test("free daily cap blocks the tutor and points at the upgrade", async ({
  page,
}) => {
  await page.goto("/chat");
  // Reuse the French thread via its project page (project chats aren't
  // sidebar rows). 4 of the 5 free messages are already spent.
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Français", exact: true })
    .click();
  await page.waitForURL(/\/project\/[0-9a-f-]{36}/);
  await page
    .getByRole("main")
    .getByRole("link", { name: /Bonjour/ })
    .first()
    .click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);

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
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Free plan" })).toBeVisible();
  await expect(page.getByText(/of 20 tutor messages/)).toBeVisible();
  await expect(page.getByText(/Billing is not configured/)).toBeVisible();
  // Models card names the roster.
  await expect(page.getByText("gpt-5.6-terra")).toBeVisible();
  await expect(page.getByText("gpt-5.6-sol")).toBeVisible();
});

test("decks: the shelf lists every deck, and opening one drills it", async ({
  page,
}) => {
  // The drill surface LANDS on a shelf now — arriving straight on a card
  // meant the app chose the deck and never showed you the others.
  await page.goto("/decks");
  await expect(
    page.getByRole("heading", { name: "Decks", exact: true }),
  ).toBeVisible();

  const shelf = page.locator(".deck-shelf");
  // "All words" leads: it's the liked layer, every word regardless of book.
  const allWords = shelf.getByRole("link", { name: /All words/ });
  await expect(allWords).toBeVisible();
  // Every book is its own deck — a book is a study unit, not a folder.
  await expect(shelf.locator(".deck-row").nth(1)).toBeVisible();

  // Pressing one opens the drill scoped to it — the card is a click
  // away, not the landing.
  await allWords.click();
  await page.waitForURL(/\/decks\?book=all/);
  await expect(
    page.getByRole("heading", { name: /Deck — All words/ }),
  ).toBeVisible();
  // …and back out to the shelf.
  await page.getByRole("link", { name: "All decks" }).click();
  await page.waitForURL(/\/decks$/);
  await expect(shelf).toBeVisible();
});

test("packs: the ⋯ menu files a word into books, toggling membership", async ({
  page,
}) => {
  // Self-contained: this test builds the book it files into, so it can't
  // inherit (or lose) another test's state.
  await page.goto("/official/gaming-japanese");
  await page.getByRole("button", { name: "More actions for 勇者" }).click();
  await page.getByRole("menuitem", { name: "New deck…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Deck name").fill("Filing Test");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("In Filing Test")).toBeVisible();

  // Selecting the same book again TOGGLES it back out — one control
  // both files and unfiles, and the ✓ says which state you're in.
  await page.getByRole("button", { name: "More actions for 勇者" }).click();
  await page.getByRole("menuitem", { name: "Filing Test" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("In Filing Test")).toBeHidden();
  // The word itself survives being pulled out of a book.
  await expect(
    page.getByRole("button", { name: "Remove 勇者 from my vocabulary" }),
  ).toBeVisible();
});

test("books: a default book is where a one-tap heart files words", async ({
  page,
}) => {
  await page.goto("/books");
  // The default is a DECK — where a one-tap heart files the word — so
  // the menu that sets it is on the deck list, not the book shelf.
  const shelf = page.locator(".decks-shelf");
  await shelf.getByRole("button", { name: "Filing Test options" }).click();
  await page.getByRole("menuitem", { name: "Make default book" }).click();
  await expect(shelf.getByText("Default")).toBeVisible();

  // The heart now says where the word lands — and lands it there, in one
  // tap, without opening the ⋯ menu at all.
  await page.goto("/official/gaming-japanese");
  const heart = page.getByRole("button", {
    name: "Save 魔王 to my vocabulary",
  });
  await expect(heart).toHaveAttribute(
    "title",
    "Save to my vocabulary and Filing Test",
  );
  await heart.click();
  await expect(page.getByText("In Filing Test").first()).toBeVisible();

  // Clearing it is the same control, inverted.
  await page.goto("/books");
  await shelf.getByRole("button", { name: "Filing Test options" }).click();
  await page.getByRole("menuitem", { name: "Clear default book" }).click();
  await expect(shelf.getByText("Default")).toBeHidden();
});

test("sentence cards: generate from words, drill the blank, land on the shelf", async ({
  page,
}) => {
  // A word to build from — self-contained, so the test doesn't depend
  // on what earlier tests left behind.
  await page.goto("/books");
  await page.getByRole("button", { name: "New word" }).click();
  const wordDialog = page.getByRole("dialog");
  await wordDialog.getByLabel("Language").selectOption("Japanese");
  await wordDialog.getByLabel("Word or phrase").fill("宝箱");
  await wordDialog.getByLabel("Meaning").fill("treasure chest");
  await wordDialog.getByRole("button", { name: "Add word" }).click();
  await expect(wordDialog).not.toBeVisible();

  // The whole point of the feature: the learner never hand-writes a
  // cloze card unless they want to. Offline (no OPENAI_API_KEY) the
  // deterministic generator runs, which is what keeps this testable.
  await page.goto("/sentences");
  await expect(
    page.getByRole("heading", { name: "Sentences", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No sentence cards yet")).toBeVisible();

  await page.getByRole("button", { name: "Make cards" }).click();
  await page.getByRole("menuitem", { name: "All words" }).click();
  await expect(page.getByText(/Made \d+ cards?\./)).toBeVisible();

  const shelf = page.locator(".sentence-shelf");
  await expect(shelf.locator(".sentence-row").first()).toBeVisible();
  // A card is a sentence with a BLANK — the marked span renders as one.
  await expect(shelf.locator(".sentence-blank").first()).toBeVisible();

  // Hand-written cards are still possible, and the blank is required:
  // text with no {{…}} is refused rather than stored as a card the
  // drill can't render.
  await page.getByRole("button", { name: "New sentence" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Language").selectOption("French");
  await dialog.getByLabel("Sentence").fill("Je voudrais un café.");
  await dialog.getByLabel("Translation").fill("I would like a coffee.");
  await dialog.getByRole("button", { name: "Add card" }).click();
  await expect(dialog.getByText(/double braces/)).toBeVisible();
  // With the blank marked, it saves.
  await dialog.getByLabel("Sentence").fill("Je voudrais un {{café}}.");
  await dialog.getByRole("button", { name: "Add card" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("I would like a coffee.")).toBeVisible();

  // Sentence decks are their OWN shelf on Decks — not rows mixed into
  // the word books.
  await page.goto("/decks");
  const sentenceDeck = page
    .locator(".deck-shelf")
    .getByRole("link", { name: /All sentences/ });
  await expect(sentenceDeck).toBeVisible();
  await sentenceDeck.click();
  await page.waitForURL(/\/decks\?sentences=all/);

  // The drill is the same stack, asking a different question: the blank
  // is hidden until you reveal, and grading moves a SEPARATE schedule.
  await expect(page.locator(".review-progress")).toHaveText(/Card 1 of \d+/);
  const blank = page.locator(".review-card .review-cloze-blank").first();
  await expect(blank).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(page.locator(".review-answer")).toBeVisible();
  await page.getByRole("button", { name: "Good" }).click();
  await expect(page.locator(".review-progress")).toHaveText(
    /Card 2 of \d+|cards? reviewed/,
  );

  // Word cards were untouched — the two schedules are independent.
  await page.goto("/sentences");
  await expect(page.locator(".sentence-shelf")).toBeVisible();
});

test("home: waiting-first quick picks, shelves, and a way back into a chat", async ({
  page,
}) => {
  // Home reflects what the learner HAS, so this test brings its own —
  // depending on what earlier tests left behind is what turned one
  // upstream timeout into four red tests last run.
  await page.goto("/books");
  await page.getByRole("button", { name: "New word" }).click();
  const wordDialog = page.getByRole("dialog");
  await wordDialog.getByLabel("Language").selectOption("Japanese");
  await wordDialog.getByLabel("Word or phrase").fill("家");
  await wordDialog.getByLabel("Meaning").fill("house");
  await wordDialog.getByRole("button", { name: "Add word" }).click();
  await expect(wordDialog).not.toBeVisible();

  await page.getByRole("button", { name: "New deck" }).click();
  const bookDialog = page.getByRole("dialog");
  await bookDialog.getByLabel("Deck name").fill("Home Test");
  await bookDialog.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/decks\/[0-9a-f-]{36}$/);

  await page.goto("/home");
  // The greeting IS the title here — on Home that's honest, where on
  // Books it would fight the sidebar's own word for the page.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The spotlight is the page's focal point — it exists only when
  // something is actually due, which a never-reviewed word guarantees.
  const spotlight = page.locator(".home-spotlight");
  await expect(spotlight).toBeVisible();
  await expect(
    spotlight.getByRole("link", { name: /Start reviewing/ }),
  ).toBeVisible();

  // Quick picks lead with what's WAITING: a never-reviewed word is due,
  // so All words carries a due badge and a play affordance.
  const picks = page.locator(".home-picks");
  await expect(picks.getByRole("link", { name: /All words/ })).toBeVisible();
  await expect(picks.getByRole("link", { name: /due/ }).first()).toBeVisible();

  // Row 1 is THEIRS — liked words first, then their books.
  await expect(picks.getByRole("link", { name: /Home Test/ })).toBeVisible();
  // Row 2 recommends official books in a language they already study,
  // and says why. Row 4 is the whole catalog.
  // Singular when they study one language ("Because you're learning
  // Japanese"), plural when several — by this point in the suite it's
  // several, so match the shared stem.
  await expect(
    page.locator(".home-recommended").getByRole("heading", {
      name: /^Because/,
    }),
  ).toBeVisible();
  await expect(page.locator(".official-shelf")).toBeVisible();

  // A quick pick is a real way in, not decoration.
  await picks.getByRole("link", { name: /All words/ }).click();
  await page.waitForURL(/\/(decks|books)\?book=all/);
});

test("urls: the old names still resolve, query strings intact", async ({
  page,
}) => {
  // Renaming a route silently breaks every bookmark and every installed
  // PWA unless the old path keeps working — so the redirects are a
  // tested promise, not a config line nobody checks.
  for (const [oldPath, expected] of [
    ["/vocab", "/books"],
    ["/vocab/review", "/decks"],
    ["/packs", "/official"],
    ["/library", "/reading"],
    ["/study/notes", "/notes"],
  ] as const) {
    await page.goto(oldPath);
    expect(new URL(page.url()).pathname, oldPath).toBe(expected);
  }

  // The query string has to survive: a bookmarked per-book deck is the
  // exact link most worth not breaking.
  await page.goto("/vocab/review?book=all");
  await page.waitForURL(/\/decks\?book=all/);
  await expect(
    page.getByRole("heading", { name: /Deck — All words/ }),
  ).toBeVisible();

  await page.goto("/packs/cafe-french");
  await page.waitForURL("**/official/cafe-french");
  await expect(page.getByText(/Café survival French/).first()).toBeVisible();
});

/**
 * The search field is a VIEWPORT BRANCH, not one element: pinned in the
 * desktop top bar, in the page body on phones (see `StudyTopbar`). Both
 * are rendered and CSS hides one, so a DOM-based `getByLabel("Search")`
 * resolves two nodes and fails strict mode — while `getByRole` sees only
 * one, because `display:none` is out of the accessibility tree.
 *
 * Resolving by ROLE is therefore both the fix and the more honest
 * assertion: it targets the field a real user can actually reach at this
 * viewport. This suite runs at desktop width, so it exercises the top
 * bar; `study-mobile.spec.ts` covers the phone branch at 390px.
 */
function searchField(page: Page) {
  return page.getByRole("searchbox", { name: "Search" });
}

test("search: one field over words, books, sentences and the catalog", async ({
  page,
}) => {
  // A word this test owns, so the assertion doesn't hinge on which
  // pack an earlier test happened to import.
  await page.goto("/books");
  await page.getByRole("button", { name: "New word" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Language").selectOption("Japanese");
  await dialog.getByLabel("Word or phrase").fill("図書館");
  await dialog.getByLabel("Meaning").fill("library building");
  await dialog.getByRole("button", { name: "Add word" }).click();
  await expect(dialog).not.toBeVisible();

  // From Home — the field is at the top of the page, and it navigates.
  await page.goto("/home");
  await searchField(page).fill("図書館");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/search\?q=/);

  // The dictionary case: the meaning is READ in the result, not hidden
  // behind the click.
  const words = page.locator(".search-group").filter({ hasText: "Words" });
  await expect(words).toBeVisible();
  await expect(words.getByText("library building")).toBeVisible();

  // Matching on the MEANING finds it too — half the time you remember
  // the English, not the word.
  await searchField(page).fill("library building");
  await page.keyboard.press("Enter");
  await page.waitForURL(/q=library/);
  await expect(
    page.locator(".search-group").filter({ hasText: "Words" }).getByText("図書館"),
  ).toBeVisible();

  // The useful half of catalog search: find the official book that
  // TEACHES a word, not just ones whose title contains it.
  await searchField(page).fill("treasure chest");
  await page.keyboard.press("Enter");
  await page.waitForURL(/q=treasure/);
  await expect(
    page.getByText(/teaches “宝箱”|Gaming Japanese/).first(),
  ).toBeVisible();

  // A miss says so rather than rendering an empty page.
  await searchField(page).fill("zzzznotathing");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Nothing matches/)).toBeVisible();
});
