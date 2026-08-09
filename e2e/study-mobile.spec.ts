import { expect, test } from "@playwright/test";
import { resetMockLearner } from "./helpers";

/**
 * Mobile-viewport branches of the study surface (390×844): the hamburger
 * drawer IS the nav on phones, the pill composer must be usable, and the
 * PWA manifest must serve. Media-query branches are code branches — they
 * get tested inside the viewport that renders them, asserting
 * clickability, not just visibility.
 */

test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(resetMockLearner);

test("hamburger opens the drawer; a nav tap navigates and closes it", async ({
  page,
}) => {
  await page.goto("/study");
  await page.getByRole("button", { name: "Open menu" }).click();
  // getByText doesn't exclude the display:none desktop sidebar — first()
  // is the drawer copy (drawer renders before the desktop aside).
  await expect(page.getByText("Self-study").first()).toBeVisible();

  await page.getByRole("link", { name: "Vocabulary" }).click();
  await page.waitForURL("**/study/vocab");
  await expect(
    page.getByRole("heading", { name: "My vocabulary" }),
  ).toBeVisible();
  // Link tap closed the drawer.
  await expect(page.getByRole("button", { name: "Close menu" })).not.toBeVisible();
});

test("chat is fully usable at phone width: new chat, type, send, reply", async ({
  page,
}) => {
  await page.goto("/study");
  await page.getByRole("button", { name: "New chat" }).click();
  await page.waitForURL(/\/study\?t=[0-9a-f-]{36}/);

  await page.getByLabel("Message").fill("hola");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Happy to help with anything/)).toBeVisible();
});

test("vocabulary is a usable card list at phone width: add, sort, edit in place", async ({
  page,
}) => {
  await page.goto("/study/vocab");
  await page.getByLabel("Language").selectOption("French");
  await page.getByLabel("Word or phrase").fill("chien");
  await page.getByLabel("Meaning").fill("dog");
  await page.getByRole("button", { name: "Add word" }).click();

  // Phones get cards, not the 8-column table (which is display:none here —
  // role queries skip it, so a listitem match proves the phone branch).
  const card = page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ hasText: "chien" });
  await expect(card).toBeVisible();

  // Column headers don't exist on this branch, so sorting has its own
  // control — it must be reachable, not just present.
  await page.getByRole("main").getByLabel("Sort by").selectOption("term");
  await expect(card).toBeVisible();

  // Edit-in-place works with a real tap, not just on desktop.
  await card.getByTitle("Edit word").click();
  const editor = page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ has: page.getByLabel("Edit term") });
  await expect(editor.getByLabel("Edit term")).toHaveValue("chien");
  await editor.getByLabel("Edit meaning").fill("dog (animal)");
  await editor.getByTitle("Save word").click();

  await expect(
    page
      .getByRole("main")
      .getByRole("listitem")
      .filter({ hasText: "chien" }),
  ).toContainText("dog (animal)");
});

test("PWA manifest and icons serve", async ({ page }) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const body = (await manifest.json()) as {
    name: string;
    display: string;
    start_url: string;
  };
  expect(body.name).toBe("Classroom");
  expect(body.display).toBe("standalone");
  expect(body.start_url).toBe("/study");

  for (const icon of [
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
  ]) {
    const res = await page.request.get(icon);
    expect(res.status(), icon).toBe(200);
  }
});
