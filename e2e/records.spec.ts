import { expect, test } from "@playwright/test";
import {
  masterEveryCardIn,
  resetMockLearner,
  resetMockTeacherE2EData,
} from "./helpers";

/**
 * WHAT THE REVIEW LOG PAYS FOR.
 *
 * Three surfaces from the 2026-08-30 CEO pass shared one gap: they were
 * built, shipped, and covered by nothing. They also share one source —
 * `study_reviews`, the log of what you actually answered — which is why
 * they are tested together rather than in three files. One trail of
 * evidence, three things it has to be able to say:
 *
 *   the run record   what that session was, and your best over the deck
 *   the error deck   the cards whose most recent answer was "again"
 *   accountability   the same fortnight, read by the tutor
 *
 * The last one is the point of the whole log: the card row always knew
 * when a card was next due, and nothing knew whether the learner showed
 * up on Tuesday.
 */

const DECK = "Records Test";

test.beforeAll(async () => {
  await resetMockLearner();
  await resetMockTeacherE2EData();
});

/** Two words, filed into a deck of their own — the fixture the rest reads. */
test("a deck to have a record of", async ({ page }) => {
  await page.goto("/decks/all");

  for (const [term, meaning] of [
    ["猫", "cat"],
    ["犬", "dog"],
  ]) {
    await page.getByRole("button", { name: "New word" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Language").selectOption("Japanese");
    await dialog.getByLabel("Word or phrase").fill(term);
    await dialog.getByLabel("Meaning").fill(meaning);
    await dialog.getByRole("button", { name: "Add word" }).click();
    await expect(dialog).not.toBeVisible();
  }

  const main = page.getByRole("main");
  await main.getByRole("button", { name: "Save as deck" }).click();
  const saveDialog = page.getByRole("dialog");
  await saveDialog.getByLabel("Deck name").fill(DECK);
  await saveDialog.getByRole("button", { name: "Save" }).click();
  await expect(saveDialog).not.toBeVisible();

  // The deck list lives on /books, not on the deck page we saved from.
  await page.goto("/books");
  await expect(
    page.locator(".decks-shelf").getByRole("link", { name: new RegExp(DECK) }),
  ).toBeVisible();
});

test("finishing a run says how it went, and the deck keeps the record", async ({
  page,
}) => {
  await page.goto("/books");
  await page
    .locator(".decks-shelf")
    .getByRole("link", { name: new RegExp(DECK) })
    .click();
  await page.waitForURL(/\/decks\/[0-9a-f-]{36}$/);
  const deckUrl = page.url();

  // Drill it. One FORGOT and one GOOD, deliberately: it makes the run a
  // 50% with a streak of 1 — numbers that could only come from these two
  // answers — and it leaves exactly one card in the error deck below.
  await page.getByRole("link", { name: /Review \d+|Practice/ }).click();
  await page.waitForURL(/\/decks\?book=/);

  await page.getByRole("button", { name: "Forgot" }).click();
  await page.getByRole("button", { name: "Good" }).click();

  // The end of a run is where the score goes — the learner has just done
  // the work and is deciding whether to come back tomorrow.
  const summary = page.locator(".run-summary");
  await expect(summary).toBeVisible({ timeout: 20_000 });
  await expect(summary).toContainText("1 of 2");
  await expect(summary).toContainText("50%");

  // A FIRST run is never a "personal best" — there was nothing to beat,
  // and congratulating it is the empty praise that devalues the real one.
  await expect(summary).not.toContainText("Personal best");
  await expect(summary).toContainText("first run");

  // And the record survives the session: the deck page keeps the board.
  await page.goto(deckUrl);
  const records = page.locator(".deck-records");
  await expect(records).toBeVisible();
  await expect(records).toContainText("Your runs");
  await expect(records).toContainText("1 of 2");
});

test("the error deck offers back only what you actually got wrong", async ({
  page,
}) => {
  // One card was answered "Forgot" above, one "Good". The claim is that
  // the deck contains the first and not the second — a due deck is mostly
  // cards arriving on schedule that you already know, and this is the
  // surface that separates them.
  await page.goto("/decks");
  const errorRow = page.getByRole("link", { name: /Cards you got wrong/ });
  await expect(errorRow).toBeVisible();
  await expect(errorRow).toContainText("1 card");

  await errorRow.click();
  await page.waitForURL(/\/decks\?errors=all/);
  await expect(
    page.getByRole("heading", { name: "Cards you got wrong" }),
  ).toBeVisible();

  // ONE card, not two. Which of the pair was dealt first is up to the
  // scheduler's tie-break between two never-reviewed cards, so the
  // identity of the forgotten word is not something this test may
  // assert — but the COUNT is exactly the claim: the card answered
  // "Good" must not come back, or the error deck is the due deck
  // wearing another name.
  await expect(page.locator(".review-progress")).toHaveText(/Card 1 of 1/);
});

test("a fully mastered deck earns the platinum trophy", async ({ page }) => {
  // Mastery is set from the harness — see `masterEveryCardIn`. A card
  // reaches `mastered` by surviving a long interval, so the schedule
  // would have to run for weeks; what is under test here is the trophy,
  // not the pipeline that awards it.
  await page.goto("/books");
  await masterEveryCardIn(DECK);

  await page
    .locator(".decks-shelf")
    .getByRole("link", { name: new RegExp(DECK) })
    .click();
  await page.waitForURL(/\/decks\/[0-9a-f-]{36}$/);

  // The deck page states it in words; the trophy ICON with its
  // `Fully mastered` label is the book page's rendering of the same flag.
  await expect(page.getByText("Fully mastered.")).toBeVisible();
});

test("the tutor sees the same fortnight the learner does", async ({ page }) => {
  // The accountability card reads the learner's OWN evidence, so a lesson
  // starts from one shared set of facts rather than two accounts of the
  // same two weeks. It finds the learner by EMAIL, which is why the
  // student is created with the mock learner's address.
  await page.goto("/students");
  await page.getByRole("button", { name: "New student" }).click();
  await page.getByLabel("Name").fill("E2E Student Accountability");
  await page.getByLabel("Target language").fill("Japanese");
  await page.getByLabel("Email").fill("teacher@class-room.dev");
  await page.getByRole("button", { name: "Create student" }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);

  // BETWEEN lessons sits on the Progress tab, above what happened DURING
  // them — the model already teaches; what a person adds is noticing
  // whether the work actually happened.
  await page.getByRole("tab", { name: "Progress" }).click();

  const card = page.locator(".accountability-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Between lessons");

  // The numbers are the learner's real ones: they studied today, and the
  // two answers above are the two reviews.
  await expect(card).toContainText("Days studied");
  await expect(card).toContainText("1/14");
  await expect(card).toContainText("Reviews");
  await expect(card).toContainText("2");

  // It leads with the uncomfortable number rather than the flattering
  // one. Which word was forgotten is the scheduler's tie-break, not this
  // test's business — that it names one, with its miss count, is.
  await expect(card).toContainText("Beating them most");
  await expect(card).toContainText("×1");
});

test("a hand-typed student with no learner account simply shows nothing", async ({
  page,
}) => {
  // The normal state for most of a tutor's roster, and not an error: no
  // account, no evidence, no card. A placeholder saying "no data" would
  // imply something is missing that never existed.
  await page.goto("/students");
  await page.getByRole("button", { name: "New student" }).click();
  await page.getByLabel("Name").fill("E2E Student NoAccount");
  await page.getByLabel("Target language").fill("French");
  await page.getByRole("button", { name: "Create student" }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);
  await page.getByRole("tab", { name: "Progress" }).click();

  await expect(page.locator(".accountability-card")).toHaveCount(0);
});
