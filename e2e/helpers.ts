import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

/**
 * Send a composer message and wait for the turn to settle (the composer
 * takes focus back in the send handler's finally block). Shared by every
 * spec that drives a chat — the AI tutor's and the teacher–student
 * thread's, which deliberately use the same interaction.
 *
 * `exact` matters: `getByLabel` matches on SUBSTRING by default, and the
 * message thread's back link is labelled "Back to All messages", which
 * contains "message". Without it the helper resolves to two elements on
 * that page and fails on strict mode.
 */
export async function sendMessage(page: Page, text: string) {
  const composer = page.getByLabel("Message", { exact: true });
  await composer.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(composer).toBeFocused();
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
 * Force every word in a deck to `mastered`.
 *
 * The PLATINUM trophy is derived from review evidence — a card reaches
 * `mastered` only by coming back after a long interval and still being
 * known. That is the whole point of it (a trophy you can farm in one
 * sitting is a sticker), and it is also why a test cannot earn one: the
 * schedule would have to run for weeks.
 *
 * So the status is set directly here, the same way `seedPilotTutor` sets
 * `payouts_enabled` — a value only the real world may produce, written
 * from the harness so the SURFACE it drives can still be tested. What is
 * under test is `isPlatinum` and the trophy it renders, not the SRS
 * pipeline that awards it; `study.spec.ts` covers that separately.
 */
export async function masterEveryCardIn(deckName: string): Promise<void> {
  const db = sql();
  try {
    await db`
      update study_vocab set status = 'mastered'
      where id in (
        select i.vocab_id from study_deck_items i
        join study_decks d on d.id = i.deck_id
        join learners l on l.id = d.learner_id
        where d.name = ${deckName} and l.workos_user_id = 'mock_teacher_dev'
      )
    `;
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

// ---------------------------------------------------------------------------
// Live lesson calls (the `live-call` tier only).
// ---------------------------------------------------------------------------

/**
 * A scheduled lesson between the mock-auth teacher and a student row,
 * plus a clean room. Returns the lesson id — the call surface is keyed
 * on lessons, not on paid bookings, which is what lets this run in an
 * environment with no Stripe at all.
 *
 * The student is a roster row with an email and NO account. That is the
 * common case in the product and the one the call guard's email match
 * exists for.
 */
export async function seedCallLesson(): Promise<{
  lessonId: string;
  teacherId: string;
}> {
  const db = sql();
  try {
    const [teacher] = await db`
      insert into teachers (workos_user_id, email, name)
      values ('mock_teacher_dev', 'teacher@class-room.dev', 'Demo Teacher')
      on conflict (workos_user_id) do update set email = excluded.email
      returning id
    `;
    await db`delete from students
      where teacher_id = ${teacher.id} and email = 'call-e2e@class-room.dev'`;
    const [student] = await db`
      insert into students (teacher_id, name, email, target_language)
      values (${teacher.id}, 'Call E2E Student', 'call-e2e@class-room.dev', 'Japanese')
      returning id
    `;
    const [lesson] = await db`
      insert into lessons
        (teacher_id, student_id, started_at, duration_minutes, status, source_type)
      values (${teacher.id}, ${student.id}, now() + interval '5 minutes', 60,
              'scheduled', 'manual')
      returning id
    `;
    return { lessonId: lesson.id, teacherId: teacher.id };
  } finally {
    await db.end();
  }
}

/** Everything this suite created, by the marker it stamps on the student. */
export async function resetCallLessons(): Promise<void> {
  const db = sql();
  try {
    await db`delete from students where email = 'call-e2e@class-room.dev'`;
  } finally {
    await db.end();
  }
}

/** Record the student's consent the way the student's own click would.
 * The suite drives only the teacher through the UI — under MOCK_AUTH
 * both sides resolve to one identity, so the second consent is written
 * directly rather than pretended. */
export async function consentAsStudent(lessonId: string): Promise<void> {
  const db = sql();
  try {
    await db`update lesson_calls set student_consent_at = now()
             where lesson_id = ${lessonId}`;
  } finally {
    await db.end();
  }
}

/** The room, the recording and its per-participant tracks, as stored. */
export async function callState(lessonId: string): Promise<{
  meetingId: string | null;
  recording:
    | { providerRecordingId: string; state: string; expectedTrackCount: number }
    | null;
  trackRoles: string[];
}> {
  const db = sql();
  try {
    const [call] = await db`
      select id, provider_meeting_id from lesson_calls where lesson_id = ${lessonId}
    `;
    if (!call) return { meetingId: null, recording: null, trackRoles: [] };
    const [rec] = await db`
      select id, provider_recording_id, state, expected_track_count
      from lesson_recordings where call_id = ${call.id}
      order by created_at desc limit 1
    `;
    if (!rec) {
      return { meetingId: call.provider_meeting_id, recording: null, trackRoles: [] };
    }
    const tracks = await db<{ role: string }[]>`
      select role from lesson_recording_tracks
      where recording_id = ${rec.id}
    `;
    return {
      meetingId: call.provider_meeting_id,
      recording: {
        providerRecordingId: rec.provider_recording_id,
        state: rec.state,
        expectedTrackCount: rec.expected_track_count,
      },
      // Sorted HERE, not in SQL: `role` is an enum, and Postgres orders
      // enum columns by DECLARATION order (teacher, student), not
      // alphabetically — which reads as a flake in an assertion.
      trackRoles: tracks.map((t) => t.role).sort(),
    };
  } finally {
    await db.end();
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * A learner account for an address, with no reviews behind it.
 *
 * This is what makes the accountability card render for a roster row:
 * `learnerForStudent` bridges the two halves of the app on EMAIL, and
 * without a learner row the card (and its nudge) correctly shows
 * nothing. Written in SQL because the app only ever creates a learner
 * from a real login, and the mock-auth tier has exactly one of those.
 */
export async function seedLearnerAccount(email: string): Promise<void> {
  const db = sql();
  try {
    await db`
      insert into learners (workos_user_id, email, name)
      values (${`e2e_learner_${email}`}, ${email}, 'E2E Learner')
      on conflict (workos_user_id) do update set email = excluded.email
    `;
  } finally {
    await db.end();
  }
}

/** Remove every learner this suite created, by the id prefix it stamps. */
export async function resetSeededLearners(): Promise<void> {
  const db = sql();
  try {
    await db`delete from learners where workos_user_id like 'e2e_learner_%'`;
  } finally {
    await db.end();
  }
}

/**
 * A message from the STUDENT side, written straight into the thread.
 *
 * The mocked tier has one identity — the mock teacher — so the incoming
 * half of a conversation cannot be produced by driving the browser. What
 * is under test here is the surface that reads it: the unread badge, the
 * bubble side, and read-on-open. The same reasoning as
 * `masterEveryCardIn`, which sets a status only weeks of real reviews
 * could otherwise produce.
 */
export async function postStudentMessage(
  threadId: string,
  body: string,
): Promise<void> {
  const db = sql();
  try {
    await db`
      insert into messages (thread_id, author, body)
      values (${threadId}, 'student', ${body})
    `;
    await db`
      update message_threads
      set last_message_at = now(), updated_at = now()
      where id = ${threadId}
    `;
  } finally {
    await db.end();
  }
}
