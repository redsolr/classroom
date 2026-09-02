import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { draftLessonFromEvidence } from "../src/lib/lesson-draft";
import {
  createTranscriptPipeline,
  markRecordingReviewed,
  type TranscriptDeps,
} from "../src/lib/lesson-transcribe-core";
import { loadLessonTranscript } from "../src/lib/lesson-transcript-queries";

/**
 * FROM OUR AUDIO TO THE TEACHER'S DESK, against the real database — no
 * browser, no bucket, no model.
 *
 * `lesson-transcript.spec.ts` covers the DECISIONS (timeline, labels,
 * composition). This covers the ORCHESTRATION around them: the claim
 * and its lease, a track that fails while the other succeeds, bytes
 * that are not the bytes we stored, a missing key, and the hand-off
 * into the SAME draft loop the teacher's button uses. The bucket and
 * the transcriber are stand-ins that do what each test says; the rows,
 * the state machine and the draft loop are real.
 *
 * The draft loop runs with NO Anthropic key, so `extractLessonDraft`
 * takes its deterministic offline path — the same one the mocked tier
 * exercises through the button. That is the point: the pipeline's
 * output is a draft on `lessons.ai_draft`, and nothing else.
 */

process.env.ANTHROPIC_API_KEY = "";

const sql = () =>
  postgres(
    process.env.DATABASE_URL ??
      "postgresql://classroom:classroom@localhost:5439/classroom",
    { max: 1 },
  );

const TEACHER_FILE = "lesson_rtk-teacher_peer-1_peer_audio_1788069291935.webm";
const STUDENT_FILE = "lesson_rtk-student_peer-2_peer_audio_1788069291640.webm";
const teacherBytes = Buffer.from("teacher voice ".repeat(100));
const studentBytes = Buffer.from("student voice ".repeat(100));
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const STUDENT_EMAILS = ["transcribe-a@class-room.dev", "transcribe-b@class-room.dev"] as const;

async function resetRows(): Promise<void> {
  const db = sql();
  try {
    await db`delete from students where email in ${db(STUDENT_EMAILS)}`;
  } finally {
    await db.end();
  }
}

/**
 * One recording exactly as the copy step leaves it: `ingested`, both
 * tracks in our bucket with their digests on the row.
 */
async function seedIngested(opts: {
  who?: (typeof STUDENT_EMAILS)[number];
  state?: "ingested" | "transcribing" | "transcribed" | "extracting";
  updatedAgoMs?: number;
  rawInput?: string | null;
  lessonStatus?: string;
}): Promise<{ lessonId: string; recordingId: string; teacherId: string; keys: { teacher: string; student: string } }> {
  const email = opts.who ?? STUDENT_EMAILS[0];
  const db = sql();
  try {
    const [teacher] = await db<{ id: string }[]>`
      insert into teachers (workos_user_id, email, name)
      values ('mock_teacher_dev', 'teacher@class-room.dev', 'Demo Teacher')
      on conflict (workos_user_id) do update set email = excluded.email
      returning id`;
    await db`delete from students where teacher_id = ${teacher.id} and email = ${email}`;
    const [student] = await db<{ id: string }[]>`
      insert into students (teacher_id, name, email, target_language)
      values (${teacher.id}, 'Transcribe Student', ${email}, 'Japanese')
      returning id`;
    const [lesson] = await db<{ id: string }[]>`
      insert into lessons (teacher_id, student_id, started_at, duration_minutes, status, source_type, raw_input)
      values (${teacher.id}, ${student.id}, now() - interval '1 hour', 60, ${opts.lessonStatus ?? "scheduled"}, 'manual', ${opts.rawInput ?? null})
      returning id`;
    const [call] = await db<{ id: string }[]>`
      insert into lesson_calls (lesson_id, teacher_id, student_id, provider_meeting_id)
      values (${lesson.id}, ${teacher.id}, ${student.id}, ${`meeting-${lesson.id}`})
      returning id`;
    const updatedAt = new Date(Date.now() - (opts.updatedAgoMs ?? 0));
    const [rec] = await db<{ id: string }[]>`
      insert into lesson_recordings
        (call_id, provider_recording_id, state, expected_track_count, started_at, ingested_at, updated_at)
      values (${call.id}, ${`rec-${lesson.id}`}, ${opts.state ?? "ingested"}, 2,
              now() - interval '1 hour', now() - interval '50 minutes', ${updatedAt})
      returning id`;
    const keys = {
      teacher: `lessons/${lesson.id}/${rec.id}/${TEACHER_FILE}`,
      student: `lessons/${lesson.id}/${rec.id}/${STUDENT_FILE}`,
    };
    await db`
      insert into lesson_recording_tracks
        (recording_id, role, provider_participant_id, provider_file_name, storage_key, bytes, sha256)
      values (${rec.id}, 'teacher', 'rtk-teacher', ${TEACHER_FILE}, ${keys.teacher}, ${teacherBytes.length}, ${sha(teacherBytes)}),
             (${rec.id}, 'student', 'rtk-student', ${STUDENT_FILE}, ${keys.student}, ${studentBytes.length}, ${sha(studentBytes)})`;
    return { lessonId: lesson.id, recordingId: rec.id, teacherId: teacher.id, keys };
  } finally {
    await db.end();
  }
}

async function recordingRow(recordingId: string) {
  const db = sql();
  try {
    const [row] = await db<{ state: string; failure_reason: string | null }[]>`
      select state, failure_reason from lesson_recordings where id = ${recordingId}`;
    const tracks = await db<
      { role: string; transcribed_at: Date | null; transcript_model: string | null; started_at: Date | null }[]
    >`select role, transcribed_at, transcript_model, started_at
      from lesson_recording_tracks where recording_id = ${recordingId}`;
    const utterances = await db<
      { role: string; sequence: number; start_ms: number; end_ms: number; text: string }[]
    >`select role, sequence, start_ms, end_ms, text
      from lesson_utterances where recording_id = ${recordingId}`;
    // Sorted HERE, not in SQL: `role` is an enum, and Postgres orders enum
    // columns by DECLARATION order (teacher, student), not alphabetically.
    return {
      ...row,
      tracks: [...tracks].sort((a, b) => a.role.localeCompare(b.role)),
      utterances: [...utterances].sort(
        (a, b) => a.role.localeCompare(b.role) || a.sequence - b.sequence,
      ),
    };
  } finally {
    await db.end();
  }
}

async function lessonRow(lessonId: string) {
  const db = sql();
  try {
    const [row] = await db<
      { status: string; source_type: string; raw_input: string | null; ai_draft: Record<string, unknown> | null }[]
    >`select status, source_type, raw_input, ai_draft from lessons where id = ${lessonId}`;
    return row;
  } finally {
    await db.end();
  }
}

/** A bucket holding exactly what the seed says it holds. */
function fakeStorage(objects: Record<string, Buffer>) {
  const reads: string[] = [];
  const storage: TranscriptDeps["storage"] = {
    getLessonAudio: async (key) => {
      reads.push(key);
      const body = objects[key];
      if (!body) throw new Error(`R2 has no object at ${key}`);
      return { body, contentType: "audio/webm" };
    },
  };
  return { storage, reads };
}

/** A transcriber that says what the test tells it to, per file. */
function fakeTranscriber(
  byFile: Record<string, { start: number; end: number; text: string }[] | Error>,
) {
  const calls: { fileName: string; bytes: number }[] = [];
  const transcriber: TranscriptDeps["transcriber"] = {
    transcribeTrack: async ({ fileName, body }) => {
      calls.push({ fileName, bytes: body.length });
      const answer = byFile[fileName];
      if (!answer) throw new Error(`no transcript scripted for ${fileName}`);
      if (answer instanceof Error) throw answer;
      return { model: "fake-transcribe", durationSeconds: 71, segments: answer };
    },
  };
  return { transcriber, calls };
}

const realDrafter: TranscriptDeps["drafter"] = { draftLesson: draftLessonFromEvidence };
const configured = () => ({ storage: true, transcriber: true });

const teacherLines = [
  { start: 0.5, end: 2.0, text: "How was your week?" },
  { start: 9.0, end: 11.0, text: "Say it again, slowly." },
];
const studentLines = [
  { start: 3.0, end: 5.0, text: "I go to Osaka on Saturday." },
  { start: 13.0, end: 15.0, text: "I went to Osaka on Saturday." },
];

test.beforeEach(async () => {
  await resetRows();
});
test.afterAll(async () => {
  await resetRows();
});

test("an ingested recording is transcribed per person, laid on one clock, and lands as a draft on the lesson", async () => {
  const { lessonId, recordingId, keys } = await seedIngested({});
  const { storage, reads } = fakeStorage({ [keys.teacher]: teacherBytes, [keys.student]: studentBytes });
  const { transcriber, calls } = fakeTranscriber({ [TEACHER_FILE]: teacherLines, [STUDENT_FILE]: studentLines });

  const outcome = await createTranscriptPipeline({ storage, transcriber, drafter: realDrafter, configured }).processRecording(recordingId);

  expect(outcome.state).toBe("awaiting_teacher_review");
  expect(outcome.transcribed).toBe(2);
  expect(outcome.drafted).toBe(true);
  // Each file was read from our bucket and handed over whole.
  expect(reads.sort()).toEqual([keys.student, keys.teacher].sort());
  expect(calls.map((c) => c.bytes).sort()).toEqual([studentBytes.length, teacherBytes.length].sort());

  const row = await recordingRow(recordingId);
  expect(row.state).toBe("awaiting_teacher_review");
  expect(row.failure_reason).toBeNull();
  for (const track of row.tracks) {
    expect(track.transcribed_at).not.toBeNull();
    expect(track.transcript_model).toBe("fake-transcribe");
    // The file name's timestamp, now on the row.
    expect(track.started_at).not.toBeNull();
  }
  // The speaker is the track, never a guess; sequences are dense per track.
  expect(row.utterances).toEqual([
    { role: "student", sequence: 0, start_ms: 3000, end_ms: 5000, text: "I go to Osaka on Saturday." },
    { role: "student", sequence: 1, start_ms: 13000, end_ms: 15000, text: "I went to Osaka on Saturday." },
    { role: "teacher", sequence: 0, start_ms: 500, end_ms: 2000, text: "How was your week?" },
    { role: "teacher", sequence: 1, start_ms: 9000, end_ms: 11000, text: "Say it again, slowly." },
  ]);

  // The two voices, interleaved by when each file began.
  const { placed } = await loadLessonTranscript(lessonId);
  expect(placed.map((u) => `${u.label} ${u.text}`)).toEqual([
    "T1 How was your week?",
    "S1 I go to Osaka on Saturday.",
    "T2 Say it again, slowly.",
    "S2 I went to Osaka on Saturday.",
  ]);

  // And the SAME draft loop the button uses wrote a draft — nothing else.
  const lesson = await lessonRow(lessonId);
  expect(lesson.ai_draft).not.toBeNull();
  expect(String(lesson.ai_draft!.summary)).toContain("Transcribe Student");
  expect(lesson.status).toBe("processed");
  expect(lesson.source_type).toBe("audio");
  // The transcript lives in its rows; the notes column stays the teacher's.
  expect(lesson.raw_input).toBeNull();
});

test("the teacher's own notes ride along with the transcript, and the notes column is never overwritten", async () => {
  const { lessonId, recordingId, keys } = await seedIngested({ rawInput: "she go -> she goes" });
  const { storage } = fakeStorage({ [keys.teacher]: teacherBytes, [keys.student]: studentBytes });
  const { transcriber } = fakeTranscriber({ [TEACHER_FILE]: teacherLines, [STUDENT_FILE]: studentLines });

  await createTranscriptPipeline({ storage, transcriber, drafter: realDrafter, configured }).processRecording(recordingId);

  const lesson = await lessonRow(lessonId);
  // The offline extractor turns an `a -> b` note into a correction: the
  // note reached the model beside the transcript.
  const corrections = lesson.ai_draft!.corrections as { originalText: string }[];
  expect(corrections).toHaveLength(1);
  expect(corrections[0].originalText).toBe("she go");
  expect(lesson.raw_input).toBe("she go -> she goes");
});

test("bytes that are not the bytes we stored are refused; the other voice is kept, and a retry does only what is missing", async () => {
  const { recordingId, keys } = await seedIngested({});
  // The student's object has been replaced by something else.
  const tampered = fakeStorage({ [keys.teacher]: teacherBytes, [keys.student]: Buffer.from("not the lesson") });
  const first = fakeTranscriber({ [TEACHER_FILE]: teacherLines, [STUDENT_FILE]: studentLines });
  const pipeline = createTranscriptPipeline({ storage: tampered.storage, transcriber: first.transcriber, drafter: realDrafter, configured });

  const outcome = await pipeline.processRecording(recordingId);
  expect(outcome.state).toBe("transcribing");
  expect(outcome.transcribed).toBe(1);
  expect(outcome.reason).toContain("do not match");
  // The tampered file never reached the transcriber.
  expect(first.calls.map((c) => c.fileName)).toEqual([TEACHER_FILE]);

  let row = await recordingRow(recordingId);
  expect(row.state).toBe("transcribing");
  expect(row.tracks.find((t) => t.role === "teacher")?.transcribed_at).not.toBeNull();
  expect(row.tracks.find((t) => t.role === "student")?.transcribed_at).toBeNull();
  expect(row.utterances.every((u) => u.role === "teacher")).toBe(true);

  // The sweep's turn, once the lease has aged, with the right bytes back.
  const db = sql();
  try {
    await db`update lesson_recordings set updated_at = now() - interval '20 minutes' where id = ${recordingId}`;
  } finally {
    await db.end();
  }
  const honest = fakeStorage({ [keys.teacher]: teacherBytes, [keys.student]: studentBytes });
  const second = fakeTranscriber({ [TEACHER_FILE]: teacherLines, [STUDENT_FILE]: studentLines });
  const retry = await createTranscriptPipeline({ storage: honest.storage, transcriber: second.transcriber, drafter: realDrafter, configured }).processRecording(recordingId);

  expect(retry.state).toBe("awaiting_teacher_review");
  expect(retry.transcribed).toBe(1);
  // Only the missing voice was read and transcribed.
  expect(honest.reads).toEqual([keys.student]);
  expect(second.calls.map((c) => c.fileName)).toEqual([STUDENT_FILE]);
  row = await recordingRow(recordingId);
  expect(row.utterances).toHaveLength(4);
});

test("a missing transcriber is written on the row and nothing is read; the recording stays ours", async () => {
  const { recordingId, keys } = await seedIngested({});
  const { storage, reads } = fakeStorage({ [keys.teacher]: teacherBytes, [keys.student]: studentBytes });
  const { transcriber } = fakeTranscriber({});

  const outcome = await createTranscriptPipeline({
    storage,
    transcriber,
    drafter: realDrafter,
    configured: () => ({ storage: true, transcriber: false }),
  }).processRecording(recordingId);

  expect(outcome.state).toBe("ingested");
  expect(reads).toEqual([]);
  const row = await recordingRow(recordingId);
  expect(row.state).toBe("ingested");
  expect(row.failure_reason).toContain("OPENAI_API_KEY");
});

test("a recording another worker took minutes ago is left alone; one abandoned long ago is taken", async () => {
  const held = await seedIngested({ state: "transcribing", updatedAgoMs: 60_000 });
  const { storage, reads } = fakeStorage({ [held.keys.teacher]: teacherBytes, [held.keys.student]: studentBytes });
  const { transcriber } = fakeTranscriber({ [TEACHER_FILE]: teacherLines, [STUDENT_FILE]: studentLines });
  const pipeline = createTranscriptPipeline({ storage, transcriber, drafter: realDrafter, configured });

  const refused = await pipeline.processRecording(held.recordingId);
  expect(refused.state).toBe("transcribing");
  expect(refused.reason).toContain("another worker");
  expect(reads).toEqual([]);

  const db = sql();
  try {
    await db`update lesson_recordings set updated_at = now() - interval '20 minutes' where id = ${held.recordingId}`;
  } finally {
    await db.end();
  }
  const taken = await pipeline.processRecording(held.recordingId);
  expect(taken.state).toBe("awaiting_teacher_review");
  expect(reads).toHaveLength(2);
});

test("a model outage during drafting is a retry on the sweep's clock, with the transcript kept", async () => {
  const { lessonId, recordingId, keys } = await seedIngested({});
  const { storage } = fakeStorage({ [keys.teacher]: teacherBytes, [keys.student]: studentBytes });
  const { transcriber, calls } = fakeTranscriber({ [TEACHER_FILE]: teacherLines, [STUDENT_FILE]: studentLines });

  let attempts = 0;
  const flaky: TranscriptDeps["drafter"] = {
    draftLesson: async (args) => {
      attempts += 1;
      if (attempts === 1) throw new Error("model is over capacity");
      return draftLessonFromEvidence(args);
    },
  };
  const pipeline = createTranscriptPipeline({ storage, transcriber, drafter: flaky, configured });

  const first = await pipeline.processRecording(recordingId);
  expect(first.state).toBe("extracting");
  expect(first.reason).toContain("over capacity");
  expect((await lessonRow(lessonId)).ai_draft).toBeNull();

  const db = sql();
  try {
    await db`update lesson_recordings set updated_at = now() - interval '20 minutes' where id = ${recordingId}`;
  } finally {
    await db.end();
  }
  const second = await pipeline.processRecording(recordingId);
  expect(second.state).toBe("awaiting_teacher_review");
  // Nothing was transcribed twice.
  expect(calls).toHaveLength(2);
  expect((await lessonRow(lessonId)).ai_draft).not.toBeNull();
});

test("a recording that transcribed to silence, with no notes, ends with the reason on the row rather than retrying forever", async () => {
  const { lessonId, recordingId, keys } = await seedIngested({});
  const { storage } = fakeStorage({ [keys.teacher]: teacherBytes, [keys.student]: studentBytes });
  const { transcriber } = fakeTranscriber({ [TEACHER_FILE]: [], [STUDENT_FILE]: [{ start: 0, end: 1, text: "   " }] });

  const outcome = await createTranscriptPipeline({ storage, transcriber, drafter: realDrafter, configured }).processRecording(recordingId);

  expect(outcome.state).toBe("completed");
  expect(outcome.drafted).toBe(false);
  const row = await recordingRow(recordingId);
  expect(row.state).toBe("completed");
  expect(row.failure_reason).toContain("Nothing to extract");
  expect(row.utterances).toHaveLength(0);
  expect((await lessonRow(lessonId)).ai_draft).toBeNull();
});

test("the teacher's decision on the draft ends the recording's pipeline, and only a recording that was waiting for it", async () => {
  const waiting = await seedIngested({ who: STUDENT_EMAILS[0], state: "transcribed" });
  const db = sql();
  try {
    await db`update lesson_recordings set state = 'awaiting_teacher_review' where id = ${waiting.recordingId}`;
  } finally {
    await db.end();
  }
  const stillCopying = await seedIngested({ who: STUDENT_EMAILS[1], state: "ingested" });

  await markRecordingReviewed(waiting.lessonId);
  await markRecordingReviewed(stillCopying.lessonId);

  expect((await recordingRow(waiting.recordingId)).state).toBe("completed");
  expect((await recordingRow(stillCopying.recordingId)).state).toBe("ingested");
});

test("the sweep picks up every recording that is ours and not yet on the desk, and says what it did", async () => {
  const a = await seedIngested({ who: STUDENT_EMAILS[0] });
  const b = await seedIngested({ who: STUDENT_EMAILS[1] });
  const { storage } = fakeStorage({
    [a.keys.teacher]: teacherBytes,
    [a.keys.student]: studentBytes,
    [b.keys.teacher]: teacherBytes,
    [b.keys.student]: studentBytes,
  });
  const { transcriber } = fakeTranscriber({ [TEACHER_FILE]: teacherLines, [STUDENT_FILE]: studentLines });

  const report = await createTranscriptPipeline({ storage, transcriber, drafter: realDrafter, configured }).reconcileTranscripts();

  expect(report.considered).toBeGreaterThanOrEqual(2);
  expect(report.transcribed).toBeGreaterThanOrEqual(4);
  expect(report.drafted).toBeGreaterThanOrEqual(2);
  expect((await recordingRow(a.recordingId)).state).toBe("awaiting_teacher_review");
  expect((await recordingRow(b.recordingId)).state).toBe("awaiting_teacher_review");
});
