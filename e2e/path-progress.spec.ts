import { expect, test } from "@playwright/test";
import { resetMockLearner } from "./helpers";

/**
 * THE LEARNING PATH AND PROGRESS — the two surfaces that answer "what
 * should I learn first" and "is any of this working".
 *
 * The claim under test in both is the same one, and it is the one worth
 * protecting: every number is DERIVED FROM EVIDENCE. Nothing is
 * asserted, no step can be ticked off by hand, and the progress page
 * declines to show a statistic it cannot stand behind. A test that only
 * checked the pages render would miss the entire point.
 */

test.beforeAll(async () => {
  await resetMockLearner();
});

test("the path guides an order without locking anything", async ({ page }) => {
  await page.goto("/path");

  await expect(page.getByRole("heading", { name: "Learning path" })).toBeVisible();

  // Exactly ONE step is marked as the next thing. A path where every row
  // is emphasised has no next step.
  await expect(page.getByText("Start here")).toHaveCount(1);

  // And every step is reachable, including ones "ahead" of it — the
  // brief was "they can jump around but we guide the foundation", so a
  // padlock would be the opposite product.
  const steps = page.locator(".path-step a");
  const count = await steps.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i += 1) {
    await expect(steps.nth(i)).toHaveAttribute("href", /.+/);
  }
});

test("a fresh learner's steps read 0 of N, not 0%", async ({ page }) => {
  await page.goto("/path");
  // The count is the honest sentence: what you've done over what the
  // step asks for, in the step's own unit. A bare percentage of a thing
  // you cannot name is not something anyone can act on.
  await expect(page.getByText(/0 \/ \d+ words known/).first()).toBeVisible();
});

test("following a path is a bookmark, and Home then points at it", async ({
  page,
}) => {
  await page.goto("/path");
  await page.getByRole("button", { name: "Follow this path" }).click();
  await expect(
    page.getByRole("button", { name: "Stop following" }),
  ).toBeVisible();

  // Home shows ONE path — a home page that suggests three curricula has
  // made a menu, not a recommendation.
  await page.goto("/home");
  const pathCard = page.locator(".home-path");
  await expect(pathCard).toHaveCount(1);
  await expect(pathCard).toContainText("Continue");

  await page.goto("/path");
  await page.getByRole("button", { name: "Stop following" }).click();
  await expect(
    page.getByRole("button", { name: "Follow this path" }),
  ).toBeVisible();
});

test("progress refuses to invent numbers it has no evidence for", async ({
  page,
}) => {
  await page.goto("/progress");
  // A learner with no cards gets an empty state that says WHY it is
  // empty, rather than a dashboard of zeroes that looks like a product
  // failing.
  await expect(page.getByText("Nothing to measure yet")).toBeVisible();
  await expect(
    page.getByText(/derived from reviews you.ve actually done/),
  ).toBeVisible();
});

test("progress counts real reviews, and says nothing it cannot support", async ({
  page,
}) => {
  // Give the learner cards and one review, through the app's own
  // surfaces — seeding the numbers directly would test the renderer
  // rather than the derivation.
  await page.goto("/official");
  await page.getByRole("link", { name: /Anime essentials/ }).first().click();
  await page.waitForURL(/\/official\/.+/);
  await page.getByRole("button", { name: "Save as my book" }).click();
  await expect(page.getByText(/Added \d+/)).toBeVisible({ timeout: 15_000 });

  await page.goto("/progress");
  await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();

  // Saved is not known: cards you imported today have never come back on
  // a later day, so the "you know this" figure must still be 0.
  const known = page.locator("text=Words and sentences you know").locator("..");
  await expect(known).toContainText("0");

  // Recall declines to show a percentage under ten graded answers — a
  // statistic that swings ten points on one miss is not information.
  await expect(
    page.getByText("needs 10 reviews to be meaningful"),
  ).toBeVisible();
});
