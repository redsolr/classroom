import { expect, test, type Page } from "@playwright/test";
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

/**
 * Go to the path and wait for the TREE, not just the document.
 *
 * The tree lays itself out and fits to the viewport on mount, so a click
 * fired the instant navigation resolves can land on a node that is still
 * moving — the click is swallowed and the panel never opens. It passes
 * every time on a fast machine and failed twice on CI, where this suite
 * runs about six times slower, taking nine unrelated study.spec tests
 * down with it each time (a failure hands the file a fresh worker, whose
 * `beforeAll` wipes the learner the other specs are mid-way through).
 *
 * The three hubs are the tree's own readiness signal — the first test in
 * this file already asserts them.
 */
async function gotoPath(page: Page): Promise<void> {
  await page.goto("/path");
  await expect(page.locator(".path-hub")).toHaveCount(3);
  // And wait for the CAMERA. The hubs existing is not the same as them
  // having stopped moving: the tree frames itself to the viewport, and a
  // click fired before that lands where the node used to be. The handler
  // never runs and Playwright reports nothing, because the click itself
  // succeeded.
  await expect(page.locator("[data-framed='true']")).toBeVisible();
}

test("the tree grows one limb per kind of evidence", async ({ page }) => {
  await gotoPath(page);

  await expect(
    page.getByRole("heading", { name: "Learning path" }),
  ).toBeVisible();

  // Three hubs, and their names are the three kinds of work — a
  // curriculum is not one queue, which is the whole reason the numbered
  // spine this replaced could not show what a learner was avoiding.
  await expect(page.locator(".path-hub")).toHaveCount(3);
  for (const limb of ["Vocabulary", "Grammar", "Conversation"]) {
    await expect(page.locator(".path-hub").getByText(limb)).toBeVisible();
  }

  // Exactly ONE node is marked as the next thing. A tree where every
  // circle is emphasised has no next step.
  await expect(page.getByText("Start here")).toHaveCount(1);
});

test("nothing on the tree is locked", async ({ page }) => {
  await gotoPath(page);

  const nodes = page.locator(".path-node");
  const count = await nodes.count();
  expect(count).toBeGreaterThan(3);

  // No node is ever disabled — "they can jump around but we guide the
  // foundation", so a padlock would be the opposite product.
  await expect(page.locator(".path-node[disabled]")).toHaveCount(0);

  // The node at the FAR end of a limb — the one a gated tree would have
  // locked — opens, and its panel offers the way in. Fit first, because
  // the canvas opens framed on the learner's next node and a node three
  // tiers up is genuinely off-frame until you pan or fit; that control
  // existing is part of the claim.
  await page.getByRole("button", { name: "Fit the whole tree" }).click();
  await nodes.last().click();
  const panel = page.locator(".path-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator("a")).toHaveAttribute("href", /.+/);
});

test("opening a node shows what it is made of, and counts nothing it cannot see", async ({
  page,
}) => {
  await gotoPath(page);
  await page.locator(".path-node").first().click();

  const panel = page.locator(".path-panel");
  await expect(panel).toBeVisible();

  // The micro-nodes are the book's real words, one square each.
  const micro = panel.locator(".path-micro-grid .micro-node");
  await expect(micro.first()).toBeVisible();
  expect(await micro.count()).toBeGreaterThan(5);

  // A fresh learner knows none of them, and the panel says so in the
  // step's own words rather than as a bare percentage.
  await expect(
    panel.getByText(/0 of \d+ recalled on a later day/),
  ).toBeVisible();

  // Tapping a micro-node names it — hover captions do not exist on a
  // phone, so the caption is a real element under the grid.
  await micro.first().click();
  await expect(panel.locator(".path-micro-caption")).toContainText(
    "not saved yet",
  );
});

test("a node counts in its own unit, and never in bare percent", async ({
  page,
}) => {
  await gotoPath(page);

  // Every node wears a rank pill: done over target, no percentage. A
  // bare "60%" of a thing you cannot name is not something anyone can
  // act on.
  const pill = page.locator(".path-node-pill").first();
  await expect(pill).toHaveText(/^\d+\/\d+$/);

  // And the unit is one hover away — the inspector names the node the
  // pointer is on, because a tree cannot carry eleven captions and a
  // number with no noun is not evidence.
  await page.locator(".path-node").first().hover();
  await expect(page.locator(".path-tree-inspector")).toContainText(
    /\d+ of \d+ words known/,
  );
});

test("the node panel is a right-hand sheet on desktop and a bottom sheet on a phone", async ({
  page,
}) => {
  // Two viewport branches, two different pieces of chrome — so both get
  // measured rather than assumed. A sheet that renders off-screen still
  // reports "visible".
  // The sheet SLIDES in, so every measurement retries until it settles
  // — a box read mid-animation is a rect the learner never sees.
  const panel = page.locator(".path-panel");

  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoPath(page);
  await page.locator(".path-node").first().click();
  await expect(async () => {
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThan(600);
    expect(box!.x + box!.width).toBeCloseTo(1280, -1);
  }).toPass();

  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoPath(page);
  // On a phone the tree opens framed on the learner's next node, so
  // that is the one under the thumb.
  await page.locator('.path-node[data-state="next"]').click();
  await expect(async () => {
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeCloseTo(390, -1);
    expect(box!.y + box!.height).toBeCloseTo(844, -1);
  }).toPass();
});

test("following a path is a bookmark, and Home then points at it", async ({
  page,
}) => {
  await gotoPath(page);
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

  await gotoPath(page);
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
