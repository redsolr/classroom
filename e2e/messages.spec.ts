import { expect, test } from "@playwright/test";
import {
  postStudentMessage,
  resetMockTeacherE2EData,
  resetSeededLearners,
  seedLearnerAccount,
  sendMessage,
} from "./helpers";

/**
 * THE THREAD BETWEEN A TEACHER AND THEIR STUDENT.
 *
 * The app had a lesson, a recap, homework and an accountability card,
 * and no way for the two people to say a sentence to each other. What
 * this covers is the loop that closes that: opening a thread, saying
 * something, seeing what came back, and the events the app files into it
 * on its own.
 *
 * ONE IDENTITY. The mocked tier signs in as the mock teacher and only
 * ever as them, so the incoming half of a conversation is written in SQL
 * (`postStudentMessage`) — the surface under test is the one that READS
 * it. `auth.real-auth.spec.ts` is the tier that can honestly assert an
 * anonymous caller is turned away.
 */

const runId = Date.now().toString(36);
const studentName = `E2E Student Messages ${runId}`;
const studentEmail = `messages-${runId}@class-room.dev`;

/** Captured by the first test, read by the rest. */
let threadUrl = "";

const threadId = () => threadUrl.split("/").pop()!.split("?")[0];

test.beforeAll(async () => {
  await resetMockTeacherE2EData();
  await resetSeededLearners();
  // Gives the roster row a learner behind it, which is what makes the
  // accountability card — and the nudge that is the point of this whole
  // feature — render at all.
  await seedLearnerAccount(studentEmail);
});

test.afterAll(async () => {
  await resetSeededLearners();
});

test("a teacher opens a thread with a student and says something", async ({
  page,
}) => {
  await page.goto("/students");
  await page.getByRole("button", { name: "New student" }).click();
  await page.getByLabel("Name").fill(studentName);
  await page.getByLabel("Target language").fill("Japanese");
  await page.getByLabel("Email").fill(studentEmail);
  await page.getByRole("button", { name: "Create student" }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);

  await page.getByRole("button", { name: "Message", exact: true }).click();
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/);
  threadUrl = page.url();

  await sendMessage(page, "How did the reading go this week?");
  await expect(
    page.getByText("How did the reading go this week?"),
  ).toBeVisible();

  // The inbox is the other half of the promise: a thread you can only
  // reach from the student page is a thread nobody checks.
  await page.goto("/messages");
  await expect(page.getByRole("link", { name: new RegExp(studentName) })).toContainText(
    "How did the reading go this week?",
  );
});

test("a student's reply arrives with a badge, and opening it clears one", async ({
  page,
}) => {
  await postStudentMessage(threadId(), "Slower than I hoped — chapter 2 only.");

  await page.goto("/messages");
  const row = page.getByRole("link", { name: new RegExp(studentName) });
  await expect(row.getByLabel("1 unread")).toBeVisible();
  // The rail carries it too — the badge exists so someone who is on a
  // different page finds out at all.
  await expect(
    page.getByRole("link", { name: /^Messages/ }).first().getByLabel("1 unread"),
  ).toBeVisible();

  await row.click();
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}/);
  await expect(
    page.getByText("Slower than I hoped — chapter 2 only."),
  ).toBeVisible();

  // Read means OPENED. Coming back to the inbox, nothing is waiting.
  await page.goto("/messages");
  await expect(row.getByLabel("1 unread")).toHaveCount(0);
});

test("assigning homework files an event into the thread", async ({ page }) => {
  await page.goto("/students");
  await page.getByRole("link", { name: new RegExp(studentName) }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);

  await page.getByRole("tab", { name: /Homework/ }).click();
  await page.getByRole("button", { name: "Assign homework" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Read chapter 3");
  await dialog.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(dialog).not.toBeVisible();

  await page.goto(threadUrl);
  await expect(page.getByText("New homework: Read chapter 3")).toBeVisible();
});

test("the nudge drafts a message rather than sending one", async ({ page }) => {
  await page.goto("/students");
  await page.getByRole("link", { name: new RegExp(studentName) }).click();
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);
  await page.getByRole("tab", { name: "Progress" }).click();

  await page.getByRole("button", { name: "Nudge" }).click();
  await page.waitForURL(/\/messages\/[0-9a-f-]{36}\?nudge=1/);

  // Drafted, not sent: the words land in the composer and a person
  // decides. Nothing has been added to the thread.
  const composer = page.getByLabel("Message", { exact: true });
  await expect(composer).toHaveValue(/I had a look before our next lesson/);
  await expect(
    page.locator(".message-list").getByText(/I had a look before our next lesson/),
  ).toHaveCount(0);
});
