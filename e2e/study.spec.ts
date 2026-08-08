import { expect, test } from "@playwright/test";
import postgres from "postgres";

/**
 * The self-study space (/study): tutor chat (offline mock tutor —
 * demonstrably grounded in the learner's vocab), the personal vocabulary
 * loop (chip-add from chat, manual add, SM-2 review), and the free-tier
 * daily cap (STUDY_FREE_DAILY_CAP=5 set by playwright.config for this
 * suite).
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
    // Cascades to study_threads, study_messages, study_vocab.
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

test("create a French chat, get a grounded mock reply, save the suggested word", async ({
  page,
}) => {
  await page.goto("/study");
  // Hero form defaults to French. The hero button is the only "New chat"
  // (sidebar folder buttons are named "Start <language> chat").
  await page.getByRole("button", { name: "New chat" }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  await page.getByLabel("Message").fill("Bonjour! Je veux apprendre.");
  await page.getByRole("button", { name: "Send" }).click();

  // Mock tutor greets and (with an empty vocab list) suggests a word.
  await expect(page.getByText(/Let's practice your French/)).toBeVisible();
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
  // Reuse the earlier test's thread via the sidebar chat tree (1 message
  // spent; the row is titled by its first message).
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
    // Turn is over when the composer takes focus back (finally block) —
    // that's the signal the stream closed and Send may be clicked again.
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
  // Models card names the Terra default and the Sol escalation.
  await expect(page.getByText("gpt-5.6-terra")).toBeVisible();
  await expect(page.getByText("gpt-5.6-sol")).toBeVisible();
});
