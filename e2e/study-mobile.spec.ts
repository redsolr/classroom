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

  await page.getByRole("link", { name: "Vocabulary" }).click();
  await page.waitForURL("**/vocab");
  await expect(
    page.getByRole("heading", { name: "My vocabulary" }),
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
  await page.goto("/vocab");
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
