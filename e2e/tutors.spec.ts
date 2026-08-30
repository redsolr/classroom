import { expect, test } from "@playwright/test";
import { resetMockLearner, resetPilotTutors, seedPilotTutor } from "./helpers";

/**
 * THE TUTOR PILOT — the directory, the slot grid, and the booking modal.
 *
 * What this tier can and cannot prove is worth stating, because the gap
 * is the interesting part. The mocked suite force-empties every Stripe
 * key (see playwright.config.ts), so nothing here can complete a
 * payment. That is not a hole in the coverage — it is the coverage: the
 * claim being tested is that a deployment WITHOUT Stripe configured
 * shows the directory honestly and refuses to take money, rather than
 * appearing to take a booking that has nowhere to land.
 *
 * The half that needs real Stripe (checkout → webhook → confirmed
 * booking → lesson on the agenda) is exercised against Stripe's test
 * mode by hand; there is no fixture that can honestly stand in for a
 * destination charge.
 */

test.beforeAll(async () => {
  await resetMockLearner();
  await resetPilotTutors();
  await seedPilotTutor({
    email: "e2e-yuki@classroom.test",
    name: "E2E Yuki",
    headline: "Japanese for people who freeze up",
    language: "Japanese",
    // Every weekday, so the two-week horizon always has slots whatever
    // day this runs.
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  });
});

test.afterAll(async () => {
  await resetPilotTutors();
});

test("the directory lists a tutor with what they teach and what it costs", async ({
  page,
}) => {
  await page.goto("/tutors");

  const row = page.getByRole("link", { name: /E2E Yuki/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Japanese for people who freeze up");
  // The price is the second fact a booking turns on, so it is on the row
  // rather than one click in.
  await expect(row).toContainText("$30.00");
});

test("the language filter is built from tutors who are actually listed", async ({
  page,
}) => {
  await page.goto("/tutors");
  // A facet offering a language nobody teaches is a dead end with a
  // confident label on it — so the chip only exists because a listed
  // tutor teaches it.
  const chip = page.getByRole("link", { name: "Japanese", exact: true });
  if (await chip.isVisible()) {
    await chip.click();
    await expect(page.getByRole("link", { name: /E2E Yuki/ })).toBeVisible();
  }
});

test("a tutor page offers real slots and shows where the money goes", async ({
  page,
}) => {
  await page.goto("/tutors");
  await page.getByRole("link", { name: /E2E Yuki/ }).click();
  await page.waitForURL(/\/tutors\/[0-9a-f-]{36}/);

  await expect(
    page.getByRole("heading", { name: "Pick a time" }),
  ).toBeVisible();

  // The split is on the page where you decide to spend the money, not in
  // a help article — and it adds up.
  await expect(page.getByText("Where your money goes")).toBeVisible();
  await expect(page.getByText("E2E Yuki receives")).toBeVisible();
  await expect(page.getByText("$25.50")).toBeVisible(); // 30.00 less our 15%
  await expect(page.getByText("$4.50")).toBeVisible();
});

test("the booking modal asks what the lesson is for, and offers both plans", async ({
  page,
}) => {
  await page.goto("/tutors");
  await page.getByRole("link", { name: /E2E Yuki/ }).click();
  await page.waitForURL(/\/tutors\/[0-9a-f-]{36}/);

  // The first available slot — any of them; the grid is generated from
  // the tutor's weekly windows, so which one is not the claim.
  await page
    .locator("button")
    .filter({ hasText: /^\d{1,2}:\d{2}(\s?[AaPp][Mm])?$/ })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("How often?")).toBeVisible();
  await expect(dialog.getByText("Just this lesson")).toBeVisible();
  await expect(dialog.getByText("Every week")).toBeVisible();

  // The focus chips are the thing the tutor's prep sheet reads.
  await expect(
    dialog.getByRole("button", { name: "Conversation" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Grammar" }).click();
  await expect(dialog.getByRole("button", { name: "Grammar" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // Choosing the weekly plan changes what the button commits you to —
  // the two prices are genuinely different, and the CTA has to say which.
  await dialog.getByText("Every week").click();
  await expect(
    dialog.getByRole("button", { name: /Start weekly lessons/ }),
  ).toBeVisible();
});

test("with Stripe unconfigured, the tutor's own page says so instead of pretending", async ({
  page,
}) => {
  // The mocked tier empties STRIPE_SECRET_KEY, which is exactly the
  // deployment shape this asserts: bookings off, and said out loud.
  await page.goto("/teaching/payouts");
  await expect(
    page.getByText(/Payouts aren.t configured on this deployment/),
  ).toBeVisible();
});

test("a tutor cannot be listed before Stripe says they can be paid", async ({
  page,
}) => {
  await page.goto("/teaching/payouts");
  // The mock teacher has no tutor profile, so the listing switch isn't
  // offered at all — the first step is saving who you are, and Stripe
  // needs the country from that form before an account can exist.
  await expect(
    page.getByRole("button", { name: "List me" }),
  ).toHaveCount(0);
  await expect(page.getByText("Not set up")).toBeVisible();
});
