import { expect, test } from "@playwright/test";
import postgres from "postgres";

/**
 * THE RECORDING ON THE LESSON PAGE — what the teacher sees of the
 * pipeline, in the mocked tier.
 *
 * The pipeline itself is proven in `lesson-transcribe.db.spec.ts`; this
 * is the promise the call page makes ("it will appear on the lesson
 * once it is ready") kept on the page it names: the state has a
 * sentence, the transcript reads as a conversation with the speaker on
 * every line, the draft it produced is the same review the teacher has
 * always had, and their decision ends the recording's pipeline.
 *
 * Rows are seeded straight into the database in the state the pipeline
 * leaves them, because the surface under test is the page, not the
 * transcriber.
 */

const sql = () =>
  postgres(
    process.env.DATABASE_URL ??
      "postgresql://classroom:classroom@localhost:5439/classroom",
    { max: 1 },
  );

const STUDENT_EMAIL = "transcript-ui@class-room.dev";

async function reset(): Promise<void> {
  const db = sql();
  try {
    await db`delete from students where email = ${STUDENT_EMAIL}`;
  } finally {
    await db.end();
  }
}

async function seedRecordedLesson(opts: {
  state: "transcribing" | "awaiting_teacher_review";
}): Promise<{ lessonId: string; recordingId: string }> {
  const db = sql();
  try {
    const [teacher] = await db<{ id: string }[]>`
      insert into teachers (workos_user_id, email, name)
      values ('mock_teacher_dev', 'teacher@class-room.dev', 'Demo Teacher')
      on conflict (workos_user_id) do update set email = excluded.email
      returning id`;
    await db`delete from students where teacher_id = ${teacher.id} and email = ${STUDENT_EMAIL}`;
    const [student] = await db<{ id: string }[]>`
      insert into students (teacher_id, name, email, target_language)
      values (${teacher.id}, 'Kenji Transcript', ${STUDENT_EMAIL}, 'English')
      returning id`;
    const drafted = opts.state === "awaiting_teacher_review";
    const draft = {
      summary: "Kenji talked about a weekend trip to Osaka.",
      topics: [{ title: "Past tense narration", description: null }],
      corrections: [
        {
          category: "grammar",
          originalText: "I go to Osaka on Saturday",
          correctedText: "I went to Osaka on Saturday",
          explanation: null,
          uncertain: false,
        },
      ],
      vocabulary: [],
      homework: [],
      insights: [],
      nextLessonSuggestion: "Keep drilling past simple in narration.",
      studentRecapDraft: "Great work today, Kenji!",
    };
    const [lesson] = await db<{ id: string }[]>`
      insert into lessons (teacher_id, student_id, started_at, duration_minutes, status, source_type, ai_draft, ai_processed_at)
      values (${teacher.id}, ${student.id}, now() - interval '2 hours', 60,
              ${drafted ? "processed" : "scheduled"}, ${drafted ? "audio" : "manual"},
              ${drafted ? db.json(draft) : null}, ${drafted ? new Date() : null})
      returning id`;
    const [call] = await db<{ id: string }[]>`
      insert into lesson_calls (lesson_id, teacher_id, student_id, provider_meeting_id)
      values (${lesson.id}, ${teacher.id}, ${student.id}, ${`meeting-${lesson.id}`})
      returning id`;
    const [rec] = await db<{ id: string }[]>`
      insert into lesson_recordings
        (call_id, provider_recording_id, state, expected_track_count, duration_seconds, started_at, ingested_at)
      values (${call.id}, ${`rec-${lesson.id}`}, ${opts.state}, 2, 71, now() - interval '2 hours', now() - interval '110 minutes')
      returning id`;
    const start = new Date("2026-08-30T05:54:51.640Z");
    const tracks = await db<{ id: string; role: string }[]>`
      insert into lesson_recording_tracks
        (recording_id, role, provider_participant_id, provider_file_name, storage_key, bytes, sha256, started_at, transcribed_at)
      values
        (${rec.id}, 'teacher', 'rtk-t', 'lesson_rtk-t_p1_peer_audio_1788069291935.webm', 'k/t', 10, 'abc', ${new Date(start.getTime() + 295)}, ${drafted ? new Date() : null}),
        (${rec.id}, 'student', 'rtk-s', 'lesson_rtk-s_p2_peer_audio_1788069291640.webm', 'k/s', 10, 'def', ${start}, ${drafted ? new Date() : null})
      returning id, role`;
    if (drafted) {
      const teacherTrack = tracks.find((t) => t.role === "teacher")!.id;
      const studentTrack = tracks.find((t) => t.role === "student")!.id;
      await db`
        insert into lesson_utterances (recording_id, track_id, role, sequence, start_ms, end_ms, text)
        values
          (${rec.id}, ${teacherTrack}, 'teacher', 0, 500, 2000, 'How was your week?'),
          (${rec.id}, ${studentTrack}, 'student', 0, 3000, 5000, 'I go to Osaka on Saturday.'),
          (${rec.id}, ${teacherTrack}, 'teacher', 1, 9000, 11000, 'Say it again, slowly.'),
          (${rec.id}, ${studentTrack}, 'student', 1, 13000, 15000, 'I went to Osaka on Saturday.')`;
    }
    return { lessonId: lesson.id, recordingId: rec.id };
  } finally {
    await db.end();
  }
}

async function recordingState(recordingId: string): Promise<string> {
  const db = sql();
  try {
    const [row] = await db<{ state: string }[]>`
      select state from lesson_recordings where id = ${recordingId}`;
    return row.state;
  } finally {
    await db.end();
  }
}

test.beforeEach(async () => {
  await reset();
});
test.afterAll(async () => {
  await reset();
});

test("while the audio is being read, the lesson says so — and shows no transcript yet", async ({ page }) => {
  const { lessonId } = await seedRecordedLesson({ state: "transcribing" });
  await page.goto(`/lessons/${lessonId}`);

  const panel = page.locator(".recording-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Transcribing", { exact: true })).toBeVisible();
  await expect(panel.getByText(/being turned into text/)).toBeVisible();
  await expect(panel.getByText(/01:11 of audio/)).toBeVisible();
  await expect(panel.locator(".transcript")).toHaveCount(0);
});

test("a drafted recording shows the conversation with the speaker on every line, the same draft review, and the teacher's decision ends it", async ({ page }) => {
  const { lessonId, recordingId } = await seedRecordedLesson({ state: "awaiting_teacher_review" });
  await page.goto(`/lessons/${lessonId}`);

  const panel = page.locator(".recording-panel");
  await expect(panel.getByText("Draft ready", { exact: true })).toBeVisible();

  // The transcript, laid on one clock: the student's file began 295 ms
  // before the teacher's, so the teacher's first line (500 ms into their
  // file) sits at 795 ms — still 00:00 on a clock a person reads — and
  // the student's last line (13 s into theirs) at 00:13.
  const lines = panel.locator(".transcript-lines li");
  await expect(lines).toHaveCount(4);
  await expect(lines.nth(0)).toContainText("00:00");
  await expect(lines.nth(0)).toContainText("You");
  await expect(lines.nth(0)).toContainText("How was your week?");
  await expect(lines.nth(1)).toContainText("Kenji Transcript");
  await expect(lines.nth(1)).toContainText("I go to Osaka on Saturday.");
  await expect(lines.nth(3)).toContainText("00:13");

  // The input panel knows the transcript is the input now.
  await expect(page.getByRole("heading", { name: "Your notes" })).toBeVisible();

  // The draft the pipeline wrote is reviewed exactly where a pasted-notes
  // draft always was.
  await expect(page.getByText("I went to Osaka on Saturday", { exact: false }).first()).toBeVisible();
  const discard = page.getByRole("button", { name: "Discard" });
  await expect(discard).toBeVisible();

  // Throwing the draft away is a decision, and the decision ends the
  // recording's pipeline. Wait for the action's round trip before
  // reading the row, per the suite's own trap list.
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(`/lessons/${lessonId}`)),
    discard.click(),
  ]);
  await expect(panel.getByText("Reviewed", { exact: true })).toBeVisible();
  expect(await recordingState(recordingId)).toBe("completed");
});
