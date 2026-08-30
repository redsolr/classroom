import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

/** Send a study-composer message and wait for the turn to settle (the
 * composer takes focus back in the send handler's finally block).
 * Shared by every spec that drives the chat. */
export async function sendMessage(page: Page, text: string) {
  await page.getByLabel("Message").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByLabel("Message")).toBeFocused();
}

function sql() {
  return postgres(
    process.env.DATABASE_URL ??
      "postgresql://classroom:classroom@localhost:5439/classroom",
    { max: 1 },
  );
}

/**
 * Reset the fixed mock-auth learner (cascades to study projects,
 * threads, messages, vocab) — the suite's idempotence guarantee on the
 * persistent local Postgres. Shared by every study spec's beforeAll.
 */
export async function resetMockLearner(): Promise<void> {
  const db = sql();
  try {
    await db`delete from learners where workos_user_id = 'mock_teacher_dev'`;
  } finally {
    await db.end();
  }
}

/**
 * Sweep the mock teacher's accumulated e2e rows — every run creates
 * `E2E Student <runId>` students (cascading lessons/records) and never
 * cleaned them up, until the pile crossed the schedule agenda's 30-row
 * page and this run's own lesson fell off it (2026-08-12 flake).
 * Deleting by the runId-stamped name patterns keeps any hand-made local
 * data intact.
 */
export async function resetMockTeacherE2EData(): Promise<void> {
  const db = sql();
  try {
    await db`
      delete from students
      where teacher_id in
        (select id from teachers where workos_user_id = 'mock_teacher_dev')
        and (name like 'E2E Student %'
          or name like 'Books E2E %'
          or name like 'Import Maki %'
          or name like 'Import Pedro %')
    `;
  } finally {
    await db.end();
  }
}

/**
 * A listed pilot tutor with weekly hours, created directly in SQL.
 *
 * Self-sufficient on purpose: the suite's own trap list records that a
 * Playwright TIMEOUT restarts the worker and re-runs `beforeAll`, so one
 * upstream failure can present as several unrelated ones. A spec that
 * depends on `npm run db:seed:tutors` having been run separately is a
 * spec that fails for a reason nobody can see in its own file.
 *
 * `payouts_enabled` is set here, which only Stripe may do for real
 * money — that is exactly why `scripts/seed-tutors.ts` refuses to run
 * against a remote database, and why this lives in the e2e helpers
 * rather than anywhere the app can reach.
 */
export async function seedPilotTutor(input: {
  email: string;
  name: string;
  headline: string;
  language: string;
  /** 0 = Sunday. Windows are in the tutor's own timezone. */
  weekdays: number[];
}): Promise<void> {
  const db = sql();
  try {
    const [teacher] = await db`
      insert into teachers (workos_user_id, email, name, timezone)
      values (${`e2e_tutor_${input.email}`}, ${input.email}, ${input.name}, 'Asia/Bangkok')
      on conflict (workos_user_id) do update set name = excluded.name
      returning id
    `;
    await db`
      insert into tutor_profiles
        (teacher_id, headline, languages, country, timezone, rate_cents,
         currency, lesson_minutes, status, payouts_enabled, stripe_account_id)
      values
        (${teacher.id}, ${input.headline}, ${[input.language]}, 'TH',
         'Asia/Bangkok', 3000, 'usd', 50, 'listed', true,
         ${`acct_e2e_${input.email}`})
      on conflict (teacher_id) do update set
        headline = excluded.headline,
        languages = excluded.languages,
        status = 'listed',
        payouts_enabled = true
    `;
    await db`delete from tutor_availability where teacher_id = ${teacher.id}`;
    for (const weekday of input.weekdays) {
      // A wide window so the two-week horizon always contains slots,
      // whatever day the suite happens to run on.
      await db`
        insert into tutor_availability (teacher_id, weekday, start_minute, end_minute)
        values (${teacher.id}, ${weekday}, 540, 1020)
      `;
    }
  } finally {
    await db.end();
  }
}

/** Remove every tutor this suite created, by the id prefix it stamps. */
export async function resetPilotTutors(): Promise<void> {
  const db = sql();
  try {
    await db`delete from teachers where workos_user_id like 'e2e_tutor_%'`;
  } finally {
    await db.end();
  }
}
