import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { createIngest, type IngestDeps } from "../src/lib/lesson-ingest-core";
import type { RecordingManifest } from "../src/lib/recording-manifest";


/**
 * LESSON AUDIO INGESTION, against the real database — no browser, no
 * provider, no bucket.
 *
 * `lesson-ingest.spec.ts` covers the DECISIONS (attribution, completeness,
 * the signature). This covers the ORCHESTRATION around them, which is
 * where a pipeline fails in ways nobody notices: a row parked in
 * `ingesting` forever, a second worker copying the same file, a partial
 * failure that either retries everything or nothing, a status flip that
 * hides the Stop button. The provider and the store are stand-ins that do
 * exactly what each test says; the rows, the claim and the state machine
 * are real.
 */

const sql = () =>
  postgres(
    process.env.DATABASE_URL ??
      "postgresql://classroom:classroom@localhost:5439/classroom",
    { max: 1 },
  );

const TEACHER_FILE = "lesson_rtk-teacher_peer-1_peer_audio_1760000000000.webm";
const STUDENT_FILE = "lesson_rtk-student_peer-2_peer_audio_1760000000001.webm";

/** Everything this spec creates carries one of these, so it can be swept away. */
const STUDENT_EMAILS = ["ingest-a@class-room.dev", "ingest-b@class-room.dev"] as const;

async function resetIngestRows(): Promise<void> {
  const db = sql();
  try {
    await db`delete from students where email in ${db(STUDENT_EMAILS)}`;
  } finally {
    await db.end();
  }
}

/**
 * One recording, in the state `startLessonRecording` leaves it, then some.
 *
 * Seeds its own teacher/student/lesson rather than using the shared
 * helper: that helper re-creates ONE fixed student each call, and a test
 * that needs two recordings would watch the first cascade away.
 */
async function seedRecording(opts: {
  who?: (typeof STUDENT_EMAILS)[number];
  state?: "recording" | "recording_complete" | "ingesting";
  updatedAgoMs?: number;
  startedAgoMs?: number;
  providerExpiresAt?: Date | null;
}): Promise<{ lessonId: string; recordingId: string }> {
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
      values (${teacher.id}, 'Ingest Student', ${email}, 'Japanese')
      returning id`;
    const [lesson] = await db<{ id: string }[]>`
      insert into lessons (teacher_id, student_id, started_at, duration_minutes, status, source_type)
      values (${teacher.id}, ${student.id}, now() - interval '1 hour', 60, 'scheduled', 'manual')
      returning id`;
    const [call] = await db<{ id: string }[]>`
      insert into lesson_calls (lesson_id, teacher_id, student_id, provider_meeting_id)
      values (${lesson.id}, ${teacher.id}, ${student.id}, ${`meeting-${lesson.id}`})
      returning id`;
    const state = opts.state ?? "recording_complete";
    const updatedAt = new Date(Date.now() - (opts.updatedAgoMs ?? 0));
    const startedAt = new Date(Date.now() - (opts.startedAgoMs ?? 60_000));
    const [rec] = await db<{ id: string }[]>`
      insert into lesson_recordings
        (call_id, provider_recording_id, state, expected_track_count,
         provider_expires_at, started_at, updated_at)
      values (${call.id}, ${`rec-${lesson.id}`}, ${state}, 2,
              ${opts.providerExpiresAt ?? null}, ${startedAt}, ${updatedAt})
      returning id`;
    await db`
      insert into lesson_recording_tracks
        (recording_id, role, provider_participant_id, provider_file_name)
      values (${rec.id}, 'teacher', 'rtk-teacher', 'pending:rtk-teacher'),
             (${rec.id}, 'student', 'rtk-student', 'pending:rtk-student')`;
    return { lessonId: lesson.id, recordingId: rec.id };
  } finally {
    await db.end();
  }
}

async function recordingRow(recordingId: string) {
  const db = sql();
  try {
    const [row] = await db<
      {
        state: string;
        failure_reason: string | null;
        duration_seconds: number | null;
        provider_expires_at: Date | null;
        ingested_at: Date | null;
      }[]
    >`select state, failure_reason, duration_seconds, provider_expires_at, ingested_at
      from lesson_recordings where id = ${recordingId}`;
    const tracks = await db<
      { role: string; provider_file_name: string; storage_key: string | null; sha256: string | null; bytes: number | null }[]
    >`select role, provider_file_name, storage_key, sha256, bytes
      from lesson_recording_tracks where recording_id = ${recordingId}`;
    // Sorted HERE, not in SQL: `role` is an enum, and Postgres orders enum
    // columns by DECLARATION order (teacher, student), not alphabetically.
    return { ...row, tracks: [...tracks].sort((a, b) => a.role.localeCompare(b.role)) };
  } finally {
    await db.end();
  }
}

/** A provider that says what the test tells it to, and counts downloads. */
function fakeProvider(
  manifest: Partial<RecordingManifest>,
  files: Record<string, Buffer | Error>,
) {
  const downloads: string[] = [];
  const provider: IngestDeps["provider"] = {
    fetchRecording: async () => ({
      status: "UPLOADED",
      durationSeconds: 121,
      expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60_000),
      files: [],
      ...manifest,
    }),
    downloadTrackFile: async (url) => {
      downloads.push(url);
      const file = files[url];
      if (!file) throw new Error(`no such file at ${url}`);
      if (file instanceof Error) throw file;
      return { body: file, contentType: "audio/webm" };
    },
  };
  return { provider, downloads };
}

/** A bucket that keeps what it is given, and reports what it kept. */
function fakeStorage() {
  const objects = new Map<string, { bytes: number; sha256: string }>();
  const storage: IngestDeps["storage"] = {
    putLessonAudio: async ({ key, body }) => {
      const sha256 = createHash("sha256").update(body).digest("hex");
      objects.set(key, { bytes: body.length, sha256 });
      return { key, bytes: body.length, sha256 };
    },
  };
  return { storage, objects };
}

function file(fileName: string, who: string, url: string) {
  return {
    fileName,
    downloadUrl: url,
    customParticipantId: who,
    providerParticipantId: fileName.split("_")[1],
  };
}

const TEACHER_URL = "https://provider.example/teacher.webm";
const STUDENT_URL = "https://provider.example/student.webm";
const teacherBytes = Buffer.from("teacher voice ".repeat(100));
const studentBytes = Buffer.from("student voice ".repeat(100));

function bothFiles(teacherId: string, studentId: string) {
  return [
    file(TEACHER_FILE, `teacher:${teacherId}`, TEACHER_URL),
    file(STUDENT_FILE, `student:${studentId}`, STUDENT_URL),
  ];
}

const configured = () => ({ provider: true, storage: true });

test.beforeEach(async () => {
  await resetIngestRows();
});
test.afterAll(async () => {
  await resetIngestRows();
});

test("a finished recording becomes ours: both voices stored, checksummed, and only then `ingested`", async () => {
  const { lessonId, recordingId } = await seedRecording({});
  const { provider } = fakeProvider(
    { files: bothFiles("t", "s") },
    { [TEACHER_URL]: teacherBytes, [STUDENT_URL]: studentBytes },
  );
  const { storage, objects } = fakeStorage();

  const outcome = await createIngest({ provider, storage, configured }).ingestRecording(recordingId);

  expect(outcome.state).toBe("ingested");
  expect(outcome.copied).toBe(2);

  const row = await recordingRow(recordingId);
  expect(row.state).toBe("ingested");
  expect(row.ingested_at).not.toBeNull();
  expect(row.failure_reason).toBeNull();
  // What the provider knew and we did not, now on the row.
  expect(row.duration_seconds).toBe(121);
  expect(row.provider_expires_at).not.toBeNull();

  // The placeholder names are gone; every track points at our bucket and
  // carries the digest of the bytes that went in.
  expect(row.tracks.map((t) => t.provider_file_name)).toEqual([STUDENT_FILE, TEACHER_FILE]);
  for (const track of row.tracks) {
    expect(track.storage_key).toBe(`lessons/${lessonId}/${recordingId}/${track.provider_file_name}`);
    expect(objects.get(track.storage_key!)).toEqual({ bytes: track.bytes, sha256: track.sha256 });
  }
});

test("one bad file does not cost the other voice, and a retry copies only what is missing", async () => {
  const { recordingId } = await seedRecording({});
  const files = bothFiles("t", "s");
  const { storage } = fakeStorage();

  // First pass: the student's link is dead.
  const first = fakeProvider(
    { files },
    { [TEACHER_URL]: teacherBytes, [STUDENT_URL]: new Error("the link may have expired") },
  );
  const outcome = await createIngest({ provider: first.provider, storage, configured }).ingestRecording(recordingId);

  expect(outcome.state).toBe("ingesting");
  expect(outcome.copied).toBe(1);
  expect(outcome.reason).toContain("only teacher audio is stored");
  expect(outcome.reason).toContain("the link may have expired");

  let row = await recordingRow(recordingId);
  expect(row.state).toBe("ingesting");
  expect(row.tracks.find((t) => t.role === "teacher")?.storage_key).not.toBeNull();
  expect(row.tracks.find((t) => t.role === "student")?.storage_key).toBeNull();

  // Second pass, the sweep's turn (the lease has expired). The teacher's
  // file is recognised as already ours and NOT fetched again.
  const db = sql();
  try {
    await db`update lesson_recordings set updated_at = now() - interval '20 minutes' where id = ${recordingId}`;
  } finally {
    await db.end();
  }
  const second = fakeProvider(
    { files },
    { [TEACHER_URL]: teacherBytes, [STUDENT_URL]: studentBytes },
  );
  const retry = await createIngest({ provider: second.provider, storage, configured }).ingestRecording(recordingId);

  expect(retry.state).toBe("ingested");
  expect(retry.copied).toBe(1);
  expect(retry.alreadyStored).toBe(1);
  expect(second.downloads).toEqual([STUDENT_URL]);

  row = await recordingRow(recordingId);
  expect(row.state).toBe("ingested");
  expect(row.failure_reason).toBeNull();
});

test("a recording that is still running is asked about, and left exactly as it was", async () => {
  // A stale `recording` row the sweep picked up — but the lesson is
  // genuinely still going. It must NOT flip to `ingesting`: the Stop
  // button looks for `recording`, and would find nothing.
  const { recordingId } = await seedRecording({ state: "recording", startedAgoMs: 3 * 60 * 60_000 });
  const { provider, downloads } = fakeProvider({ status: "RECORDING", files: [] }, {});
  const { storage } = fakeStorage();

  const outcome = await createIngest({ provider, storage, configured }).ingestRecording(recordingId);

  expect(outcome.state).toBe("recording");
  expect(outcome.reason).toContain("provider status is RECORDING");
  expect(downloads).toEqual([]);
  expect((await recordingRow(recordingId)).state).toBe("recording");
});

test("a recording another worker took minutes ago is left alone; one abandoned long ago is taken", async () => {
  const held = await seedRecording({ state: "ingesting", updatedAgoMs: 60_000 });
  const { provider, downloads } = fakeProvider(
    { files: bothFiles("t", "s") },
    { [TEACHER_URL]: teacherBytes, [STUDENT_URL]: studentBytes },
  );
  const { storage } = fakeStorage();
  const ingest = createIngest({ provider, storage, configured });

  const refused = await ingest.ingestRecording(held.recordingId);
  expect(refused.reason).toContain("another worker");
  expect(downloads).toEqual([]);

  // Same row, but the worker that held it died twenty minutes ago.
  const db = sql();
  try {
    await db`update lesson_recordings set updated_at = now() - interval '20 minutes' where id = ${held.recordingId}`;
  } finally {
    await db.end();
  }
  const taken = await ingest.ingestRecording(held.recordingId);
  expect(taken.state).toBe("ingested");
  expect(downloads).toHaveLength(2);
});

test("UPLOADED with nothing in it, after the provider's copy has expired, is a recorded loss", async () => {
  // The most dangerous payload the provider produces, at the point where
  // nothing can be done about it. Named as a failure, not retried forever.
  const { recordingId } = await seedRecording({});
  const { provider } = fakeProvider(
    { files: [], expiresAt: new Date(Date.now() - 60_000) },
    {},
  );
  const { storage } = fakeStorage();

  const outcome = await createIngest({ provider, storage, configured }).ingestRecording(recordingId);

  expect(outcome.state).toBe("failed");
  const row = await recordingRow(recordingId);
  expect(row.state).toBe("failed");
  expect(row.failure_reason).toContain("expired");
});

test("a file belonging to nobody we know is never stored under one of our people", async () => {
  const { recordingId } = await seedRecording({});
  const { provider, downloads } = fakeProvider(
    { files: [file("stranger.webm", "moderator:99", "https://provider.example/x.webm")] },
    { "https://provider.example/x.webm": Buffer.from("not ours") },
  );
  const { storage, objects } = fakeStorage();

  const outcome = await createIngest({ provider, storage, configured }).ingestRecording(recordingId);

  expect(outcome.state).toBe("ingesting");
  expect(outcome.unattributable).toHaveLength(1);
  expect(downloads).toEqual([]);
  expect(objects.size).toBe(0);
  expect((await recordingRow(recordingId)).failure_reason).toContain("unattributable");
});

test("missing configuration is written on the row, not swallowed", async () => {
  const { recordingId } = await seedRecording({});
  const { provider, downloads } = fakeProvider({ files: bothFiles("t", "s") }, {});
  const { storage } = fakeStorage();

  const outcome = await createIngest({
    provider,
    storage,
    configured: () => ({ provider: true, storage: false }),
  }).ingestRecording(recordingId);

  expect(outcome.state).toBe("recording_complete");
  expect(downloads).toEqual([]);
  expect((await recordingRow(recordingId)).failure_reason).toContain("storage is not configured");
});

test("the sweep rescues what the webhook missed, and only shouts about what is still not ours", async () => {
  // One finished recording whose webhook never arrived, one it will fail
  // to copy, both expiring within the alert window.
  const soon = new Date(Date.now() + 12 * 60 * 60_000);
  const rescued = await seedRecording({ who: STUDENT_EMAILS[0], state: "recording", startedAgoMs: 3 * 60 * 60_000, providerExpiresAt: soon });
  const stuck = await seedRecording({ who: STUDENT_EMAILS[1], providerExpiresAt: soon });

  const provider: IngestDeps["provider"] = {
    fetchRecording: async (providerRecordingId) => ({
      status: "UPLOADED",
      durationSeconds: 60,
      expiresAt: soon,
      files:
        providerRecordingId === `rec-${rescued.lessonId}`
          ? bothFiles("t", "s")
          : bothFiles("t", "s").map((f) => ({ ...f, downloadUrl: `${f.downloadUrl}?stuck` })),
    }),
    downloadTrackFile: async (url) => {
      if (url.endsWith("?stuck")) throw new Error("storage refused");
      return { body: url === TEACHER_URL ? teacherBytes : studentBytes, contentType: "audio/webm" };
    },
  };
  const { storage } = fakeStorage();

  const report = await createIngest({ provider, storage, configured }).reconcileRecordings();

  expect(report.considered).toBeGreaterThanOrEqual(2);
  expect(report.ingested).toBeGreaterThanOrEqual(1);
  expect(report.stillWaiting).toBeGreaterThanOrEqual(1);
  // The one we just rescued is NOT on the alarm list, whatever its deadline.
  const alarmed = report.expiringSoon.map((r) => r.recordingId);
  expect(alarmed).toContain(stuck.recordingId);
  expect(alarmed).not.toContain(rescued.recordingId);
  expect((await recordingRow(rescued.recordingId)).state).toBe("ingested");
  expect((await recordingRow(stuck.recordingId)).state).toBe("ingesting");
});
