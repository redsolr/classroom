import { expect, test } from "@playwright/test";
import { resetMockLearner, sendMessage } from "./helpers";

/**
 * The reading library (/reading) + Notes (/notes): a shelf
 * of generated covers, atomic notes per book, a discussion chat whose
 * context carries the book's summary + notes, and the note tools driven
 * from ANY chat through the offline mock's command grammar — the same
 * executor the real model calls, so chat → DB → next turn's prompt is
 * proven end to end.
 */

const BOOK_TITLE = "Good Strategy Bad Strategy";

test.beforeAll(resetMockLearner);

test("shelf: add a book and land on its page", async ({ page }) => {
  await page.goto("/reading");
  await expect(page.getByText("Your reading list is empty")).toBeVisible();

  await page.getByRole("button", { name: "Add book", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(BOOK_TITLE);
  await dialog.getByLabel("Author").fill("Richard Rumelt");
  await dialog
    .getByLabel("Summary")
    .fill("The kernel of strategy: diagnosis, guiding policy, coherent action.");
  await dialog.getByRole("button", { name: "Add book" }).click();

  // Create navigates straight to the book page — notes are the point.
  await page.waitForURL(/\/reading\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: BOOK_TITLE })).toBeVisible();
  // Header-scoped: the summary also sits in the settings textarea below.
  await expect(
    page.locator("header").getByText("The kernel of strategy"),
  ).toBeVisible();
});

test("book page: add a note, edit it in place", async ({ page }) => {
  await page.goto("/reading");
  await page.getByRole("link", { name: new RegExp(BOOK_TITLE) }).click();
  await page.waitForURL(/\/reading\/[0-9a-f-]{36}/);

  await page.getByLabel("New note").fill("Bad strategy is a list of goals");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(
    page.getByText("Bad strategy is a list of goals"),
  ).toBeVisible();

  // Edit in place — the card swaps to the BLOCK editor and back. There
  // is no Save button by design: it autosaves, so Done only stops
  // editing. The assertion waits on the rendered text rather than a
  // click, which is what makes it a test of the save rather than of the
  // button that used to trigger one.
  await page.getByRole("button", { name: "Edit note" }).click();
  await page
    .getByRole("textbox", { name: "paragraph block" })
    .fill("Bad strategy is goals without a diagnosis");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(
    page.getByText("Bad strategy is goals without a diagnosis"),
  ).toBeVisible();
});

test("notes are blocks: shortcuts, a tickable box, and it all survives a reload", async ({
  page,
}) => {
  await page.goto("/notes");
  await page.getByLabel("New note").fill("Notion block test");
  await page.getByRole("button", { name: "Add note" }).click();

  await page
    .locator(".note-card")
    .filter({ hasText: "Notion block test" })
    .getByRole("button", { name: "Edit note" })
    .click();

  // Scoped to the EDITOR, not the card: the card is found by its text,
  // and this test is about to replace that text — a filtered locator
  // stops matching the moment the edit lands. Only one editor is open.
  const editor = page.locator(".note-editor");

  // Markdown shortcuts are the fast path — typing the prefix converts
  // the block, so the keyboard never has to leave the text.
  await editor.getByRole("textbox").first().fill("## What I learned");
  const heading = editor.getByRole("textbox", { name: "heading block" });
  await expect(heading).toHaveValue("What I learned");

  // Enter splits into a new block; `[] ` turns it into a to-do.
  await heading.press("End");
  await heading.press("Enter");
  await editor
    .getByRole("textbox", { name: "paragraph block" })
    .fill("[] drill the verbs");
  await expect(
    editor.getByRole("textbox", { name: "todo block" }),
  ).toHaveValue("drill the verbs");

  // The box ticks, and ticking is content — it has to reach the note.
  await editor.getByRole("checkbox", { name: "drill the verbs" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  // The read view is SERVER data, so seeing the heading here already
  // proves the write landed — not merely that the editor closed. Assert
  // it before reloading: otherwise a lost edit reads as a flaky reload
  // instead of the data loss it is.
  const saved = page
    .locator(".note-card")
    .filter({ hasText: "What I learned" });
  await expect(
    saved.getByRole("heading", { name: "What I learned" }),
  ).toBeVisible();

  // And it is really stored, not just in this render: blocks came back
  // as blocks, still ticked, parsed from the markdown that was saved.
  await page.reload();
  const reloaded = page
    .locator(".note-card")
    .filter({ hasText: "What I learned" });
  await expect(
    reloaded.getByRole("heading", { name: "What I learned" }),
  ).toBeVisible();
  await expect(
    reloaded.getByRole("checkbox", { name: "drill the verbs" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("discussion chat: the book's summary + notes reach the prompt, and save note files to the book", async ({
  page,
}) => {
  await page.goto("/reading");
  await page.getByRole("link", { name: new RegExp(BOOK_TITLE) }).click();
  await page.waitForURL(/\/reading\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Discuss this book" }).click();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);

  // Injection probe: answers from ctx.book — the attached book's title
  // AND the learner's existing note reached this turn's prompt.
  await sendMessage(page, "what are we reading");
  await expect(
    page.getByText(
      /We're discussing “Good Strategy Bad Strategy”.*goals without a diagnosis/,
    ),
  ).toBeVisible();

  // Capture from conversation: the note lands on the book, not the chat.
  await sendMessage(page, "save note: Focus beats spreading resources thin");
  await expect(page.getByText(/Noted — saved to “Good Strategy/)).toBeVisible();

  await page.goto("/reading");
  await page.getByRole("link", { name: new RegExp(BOOK_TITLE) }).click();
  await expect(
    page.getByText("Focus beats spreading resources thin"),
  ).toBeVisible();
});

test("notes tab: filed notes carry their book chip; the composer adds loose notes", async ({
  page,
}) => {
  await page.goto("/notes");
  const filedCard = page
    .locator(".note-card")
    .filter({ hasText: "Focus beats spreading resources thin" });
  await expect(filedCard.getByRole("link", { name: BOOK_TITLE })).toBeVisible();

  await page.getByLabel("New note").fill("A loose standalone thought");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("A loose standalone thought")).toBeVisible();
});

test("the library index rides into EVERY chat, and add book works from conversation", async ({
  page,
}) => {
  // The landing composer IS a draft loose chat — type straight in.
  await page.goto("/chat");
  // The composer autofocuses once hydration completes — filling before
  // that loses the value to the mount reset (Send stays disabled).
  await expect(page.getByLabel("Message")).toBeFocused();

  // Injection probe: a LOOSE chat (no attached book) still knows the
  // shelf — recall works anywhere.
  await sendMessage(page, "what have i read");
  await expect(
    page.getByText(/Your library: Good Strategy Bad Strategy/),
  ).toBeVisible();
  // The first send hands the draft off to the server-rendered thread
  // view (a remount that resets the composer) — the chat header is its
  // mount marker; type message #2 only after it lands.
  await expect(page.locator(".chat-header")).toBeVisible();

  await sendMessage(
    page,
    "add book: Deep Work — focused work beats shallow busyness",
  );
  await expect(page.getByText("Added “Deep Work” to your library.")).toBeVisible();

  await page.goto("/reading");
  await expect(page.getByRole("link", { name: /Deep Work/ })).toBeVisible();
});

test("deleting a book keeps its notes as loose notes", async ({ page }) => {
  await page.goto("/reading");
  await page.getByRole("link", { name: new RegExp(BOOK_TITLE) }).click();
  await page.waitForURL(/\/reading\/[0-9a-f-]{36}/);

  await page.getByRole("button", { name: "Delete book" }).click();
  // Deleting has ONE destination whichever surface deleted it
  // (2026-08-30): the page you were on no longer exists, and the reading
  // list is a filter over the books shelf rather than its own place.
  await page.waitForURL(/\/books$/);
  await expect(
    page.locator(".books-shelf").getByText(BOOK_TITLE),
  ).toBeHidden();
  await page.goto("/reading");
  await expect(
    page.getByRole("link", { name: new RegExp(BOOK_TITLE) }),
  ).not.toBeVisible();

  // The FK frees the notes instead of destroying them (learner owns
  // context) — they now live on the Notes tab, chipless.
  await page.goto("/notes");
  const freedCard = page
    .locator(".note-card")
    .filter({ hasText: "Focus beats spreading resources thin" });
  await expect(freedCard).toBeVisible();
  await expect(freedCard.getByRole("link")).toHaveCount(0);
});
