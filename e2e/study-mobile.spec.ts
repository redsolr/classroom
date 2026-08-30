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
  await page.goto("/chat");
  await page.getByRole("button", { name: "Open menu" }).click();
  // Locators don't exclude the display:none desktop sidebar — first()
  // is the drawer copy (drawer renders before the desktop aside).
  await expect(
    page.getByRole("link", { name: "New chat" }).first(),
  ).toBeVisible();

  await page.getByRole("link", { name: "Books", exact: true }).first().click();
  await page.waitForURL("**/books");
  await expect(
    page.getByRole("heading", { name: "Books", exact: true }),
  ).toBeVisible();
  // Link tap closed the drawer.
  await expect(page.getByRole("button", { name: "Close menu" })).not.toBeVisible();
});

test("chat is fully usable at phone width: type, send, reply", async ({
  page,
}) => {
  // The landing composer is the draft chat — no New-chat step on phones
  // either; the thread is created on the first send.
  await page.goto("/chat");
  await page.getByLabel("Message").fill("hola");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Happy to help with anything/)).toBeVisible();
  await page.waitForURL(/\/chat\?t=[0-9a-f-]{36}/);

  // ChatGPT navbar: on phones the chat's ⋯ options live in the top bar
  // (portaled there — the desktop chat header is display:none here)…
  await page.getByRole("button", { name: "Chat options" }).click();
  await expect(page.getByRole("menuitem", { name: "Pin chat" })).toBeVisible();
  await page.keyboard.press("Escape");

  // …next to the quick new-chat, which returns to the draft composer.
  await page.getByRole("link", { name: "New chat" }).click();
  await page.waitForURL(/\/chat$/);
  await expect(page.getByLabel("Message")).toBeVisible();
});

test("vocabulary at phone width: books shelf, dialog add, compact table, edit", async ({
  page,
}) => {
  // The landing is the bookshelf; adding goes through the dialog.
  await page.goto("/books");
  await page.getByRole("button", { name: "New word" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByLabel("Language").selectOption("French");
  await addDialog.getByLabel("Word or phrase").fill("chien");
  await addDialog.getByLabel("Meaning").fill("dog");
  await addDialog.getByRole("button", { name: "Add word" }).click();
  await expect(addDialog).not.toBeVisible();

  // One compact TABLE on every viewport — usable at 390px, no card fork.
  await page.getByRole("link", { name: /All words/ }).click();
  await page.waitForURL(/book=all/);
  const table = page.getByRole("main").locator("table");
  const row = table.locator("tbody tr").filter({ hasText: "chien" });
  await expect(row).toBeVisible();

  // Row actions are always visible on touch — edit with a real tap.
  await row.getByRole("button", { name: "chien options" }).click();
  await page.getByRole("menuitem", { name: "Edit word" }).click();
  const editDialog = page.getByRole("dialog");
  await expect(editDialog.getByLabel("Word or phrase")).toHaveValue("chien");
  await editDialog.getByLabel("Meaning").fill("dog (animal)");
  await editDialog.getByRole("button", { name: "Save word" }).click();
  await expect(row).toContainText("dog (animal)");
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
  expect(body.start_url).toBe("/chat");

  for (const icon of [
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-512.png",
  ]) {
    const res = await page.request.get(icon);
    expect(res.status(), icon).toBe(200);
  }
});

test("the bottom quick-access bar navigates without opening the drawer", async ({
  page,
}) => {
  await page.goto("/chat");
  const tabbar = page.locator(".mobile-tabbar");
  await expect(tabbar).toBeVisible();

  // Clickability, not visibility: a fixed bar is exactly the chrome that
  // renders fine and still can't be tapped (covered, off-screen, or
  // behind the composer).
  await tabbar.getByRole("link", { name: "Decks" }).click();
  await page.waitForURL("**/decks");
  await expect(
    page.getByRole("heading", { name: "Decks", exact: true }),
  ).toBeVisible();
  // The active tab says where you are.
  await expect(tabbar.getByRole("link", { name: "Decks" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Longest-match wins: /decks must NOT also light up Books.
  await expect(
    tabbar.getByRole("link", { name: "Books" }),
  ).not.toHaveAttribute("aria-current", "page");

  await tabbar.getByRole("link", { name: "Books" }).click();
  await page.waitForURL("**/books");

  // Home leads the bar — the "what should I do now" surface.
  await tabbar.getByRole("link", { name: "Home" }).click();
  await page.waitForURL("**/home");
  await expect(tabbar.getByRole("link", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Official came OUT of the bar when Home went in — it's a cover shelf
  // on Home instead, which is one tap from the same place.
  await expect(tabbar.getByRole("link", { name: "Official" })).toHaveCount(0);
  await page
    .locator(".official-shelf")
    .getByRole("link", { name: "See all" })
    .click();
  await page.waitForURL("**/official");
  await expect(
    page.getByRole("heading", { name: "Official books" }),
  ).toBeVisible();

  // The drawer was never involved.
  await expect(page.getByRole("button", { name: "Close menu" })).toBeHidden();
});

test("the bar never covers the chat composer or the Ask button", async ({
  page,
}) => {
  // Measured rects, not eyeballed classes: a fixed bar is exactly the
  // chrome that looks right and still lands on top of something.
  await page.goto("/chat");
  const chatBar = await page.locator(".mobile-tabbar").boundingBox();
  const composer = await page.getByLabel("Message").boundingBox();
  if (!chatBar || !composer) throw new Error("chat chrome not measurable");
  expect(composer.y + composer.height).toBeLessThanOrEqual(chatBar.y + 1);

  // The Ask launcher deliberately doesn't render on /chat (that page IS
  // a chat), so it gets measured where it does exist.
  await page.goto("/books");
  const bar = await page.locator(".mobile-tabbar").boundingBox();
  const ask = await page.getByRole("button", { name: "Ask AI" }).boundingBox();
  if (!bar || !ask) throw new Error("study chrome not measurable");
  expect(ask.y + ask.height).toBeLessThanOrEqual(bar.y + 1);
});

test("search lives in the page on phones, not in a top bar", async ({
  page,
}) => {
  // The other half of the branch `study.spec.ts` covers at desktop
  // width: the pinned bar is lg-only, so at 390px the field a learner
  // can reach is the one in the page body. Asserting the pair here is
  // what stops "hidden on the wrong side of the breakpoint" — a field
  // that exists in the DOM at both sizes and is reachable at neither.
  await page.goto("/home");
  await expect(page.locator(".study-topbar")).toBeHidden();

  const field = page.getByRole("searchbox", { name: "Search" });
  await expect(field).toBeVisible();
  await field.fill("chien");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/search\?q=/);

  // And the phone field carries the query on the results page, so the
  // control reflects what is being shown under it.
  await expect(
    page.getByRole("searchbox", { name: "Search" }),
  ).toHaveValue("chien");
});
