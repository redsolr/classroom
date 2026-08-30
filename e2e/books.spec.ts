import { expect, test } from "@playwright/test";
import { resetMockLearner } from "./helpers";

/**
 * BOOKS AS CONTAINERS — the 2026-08-30 merge.
 *
 * The claim under test is the one the merge exists to make true: there
 * is now ONE thing called a book, it holds decks and notes, and deleting
 * it never takes the contents with it. That last one is the property
 * worth a test of its own — it is the difference between tidying up and
 * losing months of review history.
 */

test.beforeAll(async () => {
  await resetMockLearner();
});

test("a book holds decks, and the shelf lists books not decks", async ({
  page,
}) => {
  await page.goto("/books");
  // exact: the page title AND two shelf headings all contain "Books".
  await expect(
    page.getByRole("heading", { name: "Books", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New book" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Persona 5");
  await dialog.getByRole("button", { name: "Create book" }).click();

  // Straight into it — an empty container is only useful once you can
  // put something in it.
  await page.waitForURL(/\/books\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: "Persona 5" })).toBeVisible();

  await page.getByRole("button", { name: "New deck" }).click();
  const deckDialog = page.getByRole("dialog");
  await deckDialog.getByLabel("Deck name").fill("Palace kanji");
  await deckDialog.getByRole("button", { name: "Create deck" }).click();

  await expect(page.getByRole("link", { name: /Palace kanji/ })).toBeVisible();

  // The shelf shows the BOOK, with its deck count — not the deck.
  await page.goto("/books");
  const shelf = page.locator(".books-shelf");
  await expect(shelf.getByText("Persona 5")).toBeVisible();
  await expect(shelf.getByText("1 deck")).toBeVisible();
});

test("the old deck URL still resolves", async ({ page }) => {
  // `/books?book=<id>` was how a deck's word table was reached. Same
  // promise the 2026-08-29 URL rename made: old paths keep working.
  await page.goto("/books?book=all");
  await page.waitForURL("**/decks/all");
  await expect(page.getByText("All words")).toBeVisible();
});

test("sharing a book gives a read-only link anyone can open", async ({
  page,
  context,
}) => {
  await page.goto("/books");
  await page.locator(".books-shelf").getByRole("link", { name: /Persona 5/ }).click();
  await page.waitForURL(/\/books\/[0-9a-f-]{36}/);

  await page.getByRole("button", { name: "Create share link" }).click();
  const link = page.locator("code").filter({ hasText: "/b/" });
  // Generous: this is the first call of the share action AND the first
  // hit on /b/ in a run, so on a cold .next both pay a Turbopack
  // compile. The claim is that the link appears, not that it appears in
  // five seconds — a default-timeout failure here would be measuring
  // the dev server, not the feature.
  await expect(link).toBeVisible({ timeout: 20_000 });
  const url = (await link.textContent())?.trim();
  expect(url).toBeTruthy();

  // Opened WITHOUT a session — the token is the whole authorization, and
  // this is the only study surface that is true of.
  const anon = await context.browser()?.newContext();
  const anonPage = await anon!.newPage();
  await anonPage.goto(url!);
  await expect(
    anonPage.getByRole("heading", { name: "Persona 5" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(anonPage.getByText("Shared book")).toBeVisible();
  await anon!.close();

  // Revoking kills it immediately.
  await page.getByRole("button", { name: "Stop sharing" }).click();
  await expect(
    page.getByRole("button", { name: "Create share link" }),
  ).toBeVisible();

  const after = await context.browser()?.newContext();
  const afterPage = await after!.newPage();
  const res = await afterPage.goto(url!);
  expect(res?.status()).toBe(404);
  await after!.close();
});

test("deleting a book frees its decks instead of destroying them", async ({
  page,
}) => {
  // The property this whole model rests on. Both FKs are SET NULL, so a
  // deck comes loose with every card's review history intact — losing
  // months of work because someone tidied a container would be the least
  // forgivable thing this app could do, so it gets its own test rather
  // than being trusted to the schema.
  await page.goto("/books");
  await page.locator(".books-shelf").getByRole("link", { name: /Persona 5/ }).click();
  await page.waitForURL(/\/books\/[0-9a-f-]{36}/);

  await expect(page.getByRole("link", { name: /Palace kanji/ })).toBeVisible();

  // The confirm names what SURVIVES, which is the whole point of the
  // message — accept it and check the promise held.
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("stay");
    void dialog.accept();
  });
  await page.getByRole("button", { name: /Persona 5 options/ }).click();
  await page.getByRole("menuitem", { name: "Delete book" }).click();

  await page.waitForURL("**/books");
  await expect(page.locator(".books-shelf")).not.toContainText("Persona 5");

  // The deck is still here — loose, not gone. It shows in the deck list,
  // which carries every deck whether or not a book holds it.
  await expect(
    page.locator(".decks-shelf").getByText("Palace kanji"),
  ).toBeVisible();
});
