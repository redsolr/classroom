import { expect, request as pwRequest, test, type Page } from "@playwright/test";
import postgres from "postgres";

/**
 * The adversarial tier — REAL WorkOS auth, no MOCK_AUTH anywhere.
 *
 * Exists because the mocked tier structurally cannot test the promise
 * "anonymous is rejected": under MOCK_AUTH every caller IS the demo
 * teacher, so the rejection path never executes. That exact blind spot
 * hid the CRM's unauthenticated /api surface for nine days (2026-08-08).
 * This is testing-discipline.md § adversarial isolation, applied to
 * class-room's server actions — the app's only write surface.
 *
 * What it proves:
 *   1. every protected page redirects anonymous callers to /login
 *   2. a REAL email+password login lands on the schedule
 *   3. a captured server-action mutation, replayed byte-for-byte WITHOUT
 *      the session cookie, does not mutate (the decisive assertion is on
 *      the database, not the response envelope)
 *   4. logout revokes the session — the next protected request bounces
 *
 * Prereqs: docker Postgres on :5439 (migrated), WorkOS creds in
 * .env.local, and the synthetic teacher from `npm run e2e:user`
 * (E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD). Without creds the
 * login-dependent tests skip; the anonymous sweep always runs.
 */

const BASE_URL = "http://localhost:3020";
const EMAIL = process.env.E2E_TEACHER_EMAIL;
const PASSWORD = process.env.E2E_TEACHER_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
const HAS_CREDS = Boolean(EMAIL && PASSWORD && DATABASE_URL);

const runId = Date.now().toString(36);
const createdName = `Real E2E ${runId}`;
const replayName = `Anon Replay ${runId}`;

test.describe.configure({ mode: "serial" });

/** Every teacher/student surface behind requireTeacher/requireStudent. */
const PROTECTED_ROUTES = [
  "/schedule",
  "/dashboard",
  "/students",
  "/calendar",
  "/lessons",
  "/settings",
  "/student",
  "/study",
  "/study/vocab",
  "/study/vocab/review",
  "/study/account",
  "/study/project/new",
];

function sql() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL missing");
  return postgres(DATABASE_URL, { max: 1 });
}

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(EMAIL!);
  await page.locator('input[name="password"]').fill(PASSWORD!);
  await page.locator('button[type="submit"]').click();
  // The real flow lands on /dashboard (the mocked tier's landing redirect
  // goes to /schedule) — accept either, the session is what matters.
  await page.waitForURL(/\/(dashboard|schedule)(\?|$)/);
}

test.afterAll(async () => {
  if (!HAS_CREDS) return;
  // The e2e teacher accumulates one student per run — the same trap that
  // makes the mocked tier need db:seed. Sweep this run's rows (and any
  // strays from earlier runs) so the tier stays self-cleaning.
  const db = sql();
  try {
    await db`
      DELETE FROM students
      WHERE name LIKE 'Real E2E %' OR name LIKE 'Anon Replay %'
    `;
  } finally {
    await db.end();
  }
});

test("anonymous requests are redirected to /login on every protected surface", async ({
  browser,
}) => {
  const anon = await pwRequest.newContext({ baseURL: BASE_URL });
  for (const route of PROTECTED_ROUTES) {
    const res = await anon.get(route, { maxRedirects: 0 });
    expect(res.status(), `${route} must redirect, not serve`).toBeGreaterThanOrEqual(300);
    expect(res.status(), `${route} must redirect, not serve`).toBeLessThan(400);
    const location = res.headers()["location"] ?? "";
    expect(location, `${route} must bounce to /login`).toContain("/login");
  }
  await anon.dispose();

  // And the browser-level experience matches the wire-level one.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/schedule");
  await page.waitForURL("**/login");
  await context.close();
});

test("anonymous POST to the study chat API is a 401, never a served reply", async () => {
  const anon = await pwRequest.newContext({ baseURL: BASE_URL });
  const res = await anon.post("/api/study/chat", {
    data: {
      threadId: "00000000-0000-4000-8000-000000000000",
      message: "hello?",
    },
    maxRedirects: 0,
  });
  expect(res.status(), "study chat must reject anonymous callers").toBe(401);
  await anon.dispose();
});

test("anonymous GET of the vocab CSV export is a 401, never data", async () => {
  const anon = await pwRequest.newContext({ baseURL: BASE_URL });
  const res = await anon.get("/study/vocab/export.csv", { maxRedirects: 0 });
  expect(res.status(), "vocab export must reject anonymous callers").toBe(401);
  await anon.dispose();
});

test("real email+password login opens an authenticated session", async ({
  page,
}) => {
  test.skip(!HAS_CREDS, "E2E_TEACHER_* / DATABASE_URL not set — run npm run e2e:user");
  await login(page);
  // The session works across protected surfaces, not just the landing.
  await page.goto("/schedule");
  await expect(
    page.getByRole("heading", { name: "Schedule", exact: true }),
  ).toBeVisible();
});

test("a captured mutation replayed without a session does not mutate", async ({
  page,
}) => {
  test.skip(!HAS_CREDS, "E2E_TEACHER_* / DATABASE_URL not set — run npm run e2e:user");
  await login(page);

  // Drive a REAL create-student mutation and capture the exact wire
  // request Next sends for the server action.
  await page.goto("/students");
  await page.getByRole("button", { name: "New student" }).click();
  await page.getByLabel("Name").fill(createdName);
  await page.getByLabel("Target language").fill("English");
  const [actionRequest] = await Promise.all([
    page.waitForRequest(
      (r) => r.method() === "POST" && r.headers()["next-action"] !== undefined,
    ),
    page.getByRole("button", { name: "Create student" }).click(),
  ]);
  await page.waitForURL(/\/students\/[0-9a-f-]{36}/);

  const captured = {
    url: actionRequest.url(),
    headers: actionRequest.headers(),
    body: actionRequest.postData(),
  };
  expect(captured.body).toContain(createdName);

  // Positive control: the authenticated request really did mutate.
  const db = sql();
  try {
    const [before] = await db`
      SELECT count(*)::int AS n FROM students WHERE name = ${createdName}
    `;
    expect(before.n).toBe(1);

    // Replay the SAME action id + body — same origin, same content type,
    // NO session cookie. Only the name differs, so a successful mutation
    // would be unmistakable.
    const anon = await pwRequest.newContext({ baseURL: BASE_URL });
    const replayRes = await anon.post(new URL(captured.url).pathname, {
      headers: {
        "next-action": captured.headers["next-action"],
        "content-type": captured.headers["content-type"],
        origin: BASE_URL,
        referer: captured.headers["referer"] ?? `${BASE_URL}/students`,
      },
      data: captured.body!.split(createdName).join(replayName),
      maxRedirects: 0,
    });
    await anon.dispose();

    // The envelope may be a redirect or an action error — what it must
    // never be is a mutation. The database is the verdict.
    const [after] = await db`
      SELECT count(*)::int AS n FROM students WHERE name = ${replayName}
    `;
    expect(
      after.n,
      `anonymous replay must not create a row (response was ${replayRes.status()})`,
    ).toBe(0);
  } finally {
    await db.end();
  }
});

test("logout revokes the session — protected pages bounce again", async ({
  page,
}) => {
  test.skip(!HAS_CREDS, "E2E_TEACHER_* / DATABASE_URL not set — run npm run e2e:user");
  await login(page);
  await page.goto("/logout");
  await page.waitForURL((url) => !url.pathname.startsWith("/logout"));
  await page.goto("/schedule");
  await page.waitForURL("**/login");
});
