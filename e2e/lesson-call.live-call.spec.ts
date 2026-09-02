import { expect, test, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { sha256Hex, signRequest } from "../src/lib/s3-signature";
import {
  callState,
  consentAsStudent,
  resetCallLessons,
  seedCallLesson,
} from "./helpers";

/**
 * A REAL LESSON CALL — two browsers, one RealtimeKit room, one recording.
 *
 * This tier exists because the thing most worth protecting here cannot be
 * mocked. The provider will accept a track recording whose participant
 * allowlist matches nobody, run it for two minutes, and report UPLOADED
 * with a real duration and no error — and produce ZERO files. A fake
 * provider would have returned whatever we told it to. Only a real call
 * can prove we are recording the people who are actually in the room.
 *
 * WHAT IT COVERS
 *  - the room is created when the lesson is OPENED, not when it is joined
 *    (consent comes first, and has to attach to something)
 *  - recording is refused until BOTH people have consented
 *  - recording is refused unless both are actually connected
 *  - a started recording writes one track row per person, with roles
 *  - the provider returns exactly one audio file per participant, each
 *    attributable to a role
 *
 * WHAT IT DOES NOT COVER, and why
 *  - the STUDENT's own UI. Under MOCK_AUTH every request resolves to one
 *    identity, so a second browser cannot be a second person in the app.
 *    The student joins the real room with a real participant token and
 *    their consent is written directly. The claim under test is about the
 *    room and the recording, not about rendering the same component twice.
 *  - audio CONTENT. The files are asserted to exist, be attributed and be
 *    non-trivial in size. Whether the words in them are right is a
 *    transcription question, and transcription is not built yet.
 *
 * Opt-in: `npm run test:e2e:live-call`. It spends real provider minutes,
 * which is why the default tier ignores it and why it skips loudly rather
 * than failing when credentials are absent.
 */

const APP_ID = process.env.REALTIMEKIT_APP_ID;
const API_KEY = process.env.REALTIMEKIT_API_KEY;
const CONFIGURED = Boolean(APP_ID && API_KEY);

const SDK_PATH =
  "node_modules/@cloudflare/realtimekit/dist/browser.js";

test.skip(
  !CONFIGURED,
  "REALTIMEKIT_APP_ID / REALTIMEKIT_API_KEY not set — live-call tier skipped",
);

// A real call needs time: two joins, a recording, and the provider's own
// upload. The default 60s timeout is for page interactions.
test.setTimeout(5 * 60_000);

async function rtk<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const auth = Buffer.from(`${APP_ID}:${API_KEY}`).toString("base64");
  const res = await fetch(`https://api.realtime.cloudflare.com/v2${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RealtimeKit ${path} → ${res.status}: ${text}`);
  return JSON.parse(text) as T;
}

/**
 * The student's browser, joining the real room with a real token.
 *
 * It navigates to the app's origin first and only then injects the SDK:
 * `getUserMedia` needs a secure context, and `about:blank` is not one, so
 * a page built with `setContent` would fail on camera access alone.
 */
async function joinAsStudent(
  browser: Browser,
  meetingId: string,
  baseURL: string,
): Promise<Page> {
  const participant = await rtk<{ data: { token: string } }>(
    `/meetings/${meetingId}/participants`,
    {
      method: "POST",
      body: {
        name: "Call E2E Student",
        custom_participant_id: "student:e2e",
        preset_name: "group_call_participant",
      },
    },
  );

  const context = await browser.newContext({
    permissions: ["microphone", "camera"],
  });
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.addScriptTag({ path: SDK_PATH });
  await page.evaluate(async (token: string) => {
    const w = window as unknown as {
      RealtimeKitClient: {
        init: (o: {
          authToken: string;
          defaults: { audio: boolean; video: boolean };
        }) => Promise<{ join: () => Promise<void> }>;
      };
      __joined?: boolean;
      __meeting?: unknown;
    };
    const meeting = await w.RealtimeKitClient.init({
      authToken: token,
      defaults: { audio: true, video: true },
    });
    await meeting.join();
    // Kept so the chat test can put a payload on the wire the way the
    // student's own app would.
    w.__meeting = meeting;
    w.__joined = true;
  }, participant.data.token);
  await page.waitForFunction(
    () => (window as unknown as { __joined?: boolean }).__joined === true,
    null,
    { timeout: 90_000 },
  );
  return page;
}

test("a lesson call records one audio track per person, and only after both consent", async ({
  page,
  browser,
  baseURL,
}) => {
  await resetCallLessons();
  const { lessonId } = await seedCallLesson();

  // --- the room exists because the lesson was opened ------------------
  await page.goto(`/call/${lessonId}`);
  await expect(page.getByRole("heading", { name: /Lesson with/ })).toBeVisible();

  const opened = await callState(lessonId);
  expect(
    opened.meetingId,
    "opening the lesson must create the room — consent comes before joining and has to attach to something",
  ).toBeTruthy();
  expect(opened.recording).toBeNull();

  // --- consent is per person -----------------------------------------
  await page.getByRole("button", { name: /I agree to be recorded/ }).click();
  await expect(page.getByText(/You agreed/)).toBeVisible();
  // One side is not both sides: the teacher's own consent must not unlock
  // recording on its own.
  await expect(page.getByText(/Waiting for/)).toBeVisible();

  // The student's consent is written before anyone joins, so the teacher
  // joins exactly ONCE below. Joining twice would be a test artifact with
  // teeth: every join mints a new participant token, so one person would
  // arrive in the session as two peers.
  await consentAsStudent(lessonId);
  await page.reload();

  await page.getByRole("button", { name: /^Join lesson$/ }).click();
  await expect(page.getByText(/Waiting for|Connecting/)).toBeVisible({
    timeout: 60_000,
  });

  // Both have consented, but the teacher is alone in the room. Recording
  // must still be refused — by the SERVER, so a disabled button is not
  // what is being tested here.
  expect(
    (await callState(lessonId)).recording,
    "recording a room with one person in it produces a lesson with no second voice",
  ).toBeNull();

  // --- both present, both consented ----------------------------------
  const student = await joinAsStudent(
    browser,
    opened.meetingId!,
    baseURL ?? "http://localhost:3020",
  );
  await expect(page.getByText(/Waiting for/)).toBeHidden({ timeout: 60_000 });

  await page.getByRole("button", { name: /^Record$/ }).click();
  await expect(page.getByText(/Recording & transcribing/)).toBeVisible({
    timeout: 60_000,
  });

  const recording = await callState(lessonId);
  expect(recording.recording?.state).toBe("recording");
  expect(
    recording.trackRoles,
    "the file-to-person mapping is decided while we can see the room, not by parsing file names later",
  ).toEqual(["student", "teacher"]);
  expect(recording.recording?.expectedTrackCount).toBe(2);

  // Enough real audio that the provider produces a file worth checking.
  await page.waitForTimeout(30_000);
  await page.getByRole("button", { name: /^Stop$/ }).click();

  // --- what the provider actually produced ----------------------------
  const id = recording.recording!.providerRecordingId;
  let final: RawRecording | null = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(5_000);
    const body = await rtk<{ data: { recording?: RawRecording } & RawRecording }>(
      `/recordings/${id}`,
    );
    const raw = body.data.recording ?? body.data;
    if (raw.status === "UPLOADED" || raw.status === "ERRORED") {
      final = raw;
      break;
    }
  }
  expect(final, "the recording never reached a terminal state").not.toBeNull();
  expect(final!.status).toBe("UPLOADED");

  const files = (final!.download_url?.links ?? []).flatMap((layer) =>
    Object.entries(layer.download_urls ?? {}).map(([name, file]) => ({
      name,
      who: file.custom_participant_id,
    })),
  );

  // THE ASSERTION THIS TIER EXISTS FOR. An allowlist that matches nobody
  // still reports UPLOADED with a real duration and no error, and yields
  // nothing — so a status check would pass while the lesson was lost.
  //
  // Phrased as "every person is represented", not "exactly N files": a
  // reconnect mid-lesson legitimately produces a second file for the same
  // person, and a test that forbade that would fail on a dropped wifi
  // connection while the lesson was captured perfectly.
  const owners = files.map((f) => f.who ?? "");
  expect(
    owners.filter((o) => o.startsWith("teacher:")).length,
    "the teacher's voice is missing from the recording",
  ).toBeGreaterThanOrEqual(1);
  expect(
    owners.filter((o) => o.startsWith("student:")).length,
    "the student's voice is missing from the recording",
  ).toBeGreaterThanOrEqual(1);
  expect(files.length).toBeGreaterThanOrEqual(
    recording.recording!.expectedTrackCount,
  );

  // --- and then it becomes OURS ----------------------------------------
  // No webhook reaches a local dev server, so this is the sweep's path —
  // which is also the more important one to prove, since it is what
  // rescues a lesson whose webhook never arrived. Skipped, loudly, where
  // there is no bucket to copy into: the recording assertions above are
  // still worth having on a machine without R2 credentials.
  if (process.env.R2_ACCESS_KEY_ID && process.env.CRON_SECRET) {
    const sweep = await fetch(`${baseURL ?? "http://localhost:3020"}/api/calls/reconcile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(sweep.status, "the sweep must be reachable with the bearer").toBe(200);
    const report = (await sweep.json()) as {
      ingested: number;
      failed: number;
      transcripts: { transcribed: number; failed: number };
    };
    expect(report.ingested, "the sweep must have copied this recording").toBeGreaterThanOrEqual(1);

    const stored = await storedTracks(lessonId);
    // ONE sweep carries a recording from finished to the teacher's desk:
    // copied, then — in the same run — read. So the state here is
    // `ingested` only on a machine with no transcriber; anywhere else it
    // has already moved on. What this block proves is the COPY, whatever
    // happened after it.
    expect([
      "ingested",
      "transcribing",
      "transcribed",
      "extracting",
      "awaiting_teacher_review",
      "completed",
    ]).toContain(stored.state);
    // Both voices, each in our bucket, each checksummed.
    expect(stored.tracks.map((t) => t.role).sort()).toEqual(["student", "teacher"]);
    for (const track of stored.tracks) {
      expect(track.storage_key).not.toBeNull();
      expect(track.sha256).toMatch(/^[0-9a-f]{64}$/);
      // Independently of anything the ingest itself checked: the object
      // is there, and it is the size the row says it is.
      const head = await headObject(track.storage_key!);
      expect(head.status, `${track.storage_key} must exist in our bucket`).toBe(200);
      expect(Number(head.headers.get("content-length"))).toBe(track.bytes);
    }

    // --- and then it is READ ----------------------------------------------
    // The same sweep carries a recording from `ingested` to the teacher's
    // desk. Chromium's fake microphone produces a tone, not speech, so
    // what is proven here is the PIPELINE on a real file with a real
    // model — both tracks read back out of our bucket, hashed against
    // the row, sent to the transcriber, marked transcribed — and that the
    // recording reaches a terminal state rather than parking. Whether the
    // words are right is a question this audio cannot ask.
    if (process.env.OPENAI_API_KEY) {
      expect(
        report.transcripts.transcribed,
        "both voices must have been transcribed by the same sweep that copied them",
      ).toBeGreaterThanOrEqual(2);

      const done = await storedTracks(lessonId);
      expect(["awaiting_teacher_review", "completed"]).toContain(done.state);
      for (const track of done.tracks) {
        expect(track.transcribed_at, `${track.role}'s track must be marked transcribed`).not.toBeNull();
      }
    } else {
      console.warn("live-call: OPENAI_API_KEY absent — the transcription of the copied audio was not proven");
    }
  } else {
    console.warn("live-call: R2 credentials or CRON_SECRET absent — the copy into our bucket was not proven");
  }

  await student.close();
  await resetCallLessons();
});

test("a line typed in the lesson is the same thread as /messages", async ({
  page,
  browser,
  baseURL,
}) => {
  await resetCallLessons();
  const { lessonId } = await seedCallLesson();

  // Nobody consents here: chat is not recording, and a lesson where one
  // of them declines must still be a lesson they can type in.
  await page.goto(`/call/${lessonId}`);
  await expect(page.getByRole("heading", { name: /Lesson with/ })).toBeVisible();
  await page.getByRole("button", { name: /^Join lesson$/ }).click();
  await expect(page.getByText(/Waiting for|Connecting/)).toBeVisible({
    timeout: 60_000,
  });

  const opened = await callState(lessonId);
  const student = await joinAsStudent(
    browser,
    opened.meetingId!,
    baseURL ?? "http://localhost:3020",
  );
  await expect(page.getByText(/Waiting for/)).toBeHidden({ timeout: 60_000 });

  // --- sending ---------------------------------------------------------
  await page.getByRole("button", { name: "Messages" }).click();
  const composer = page.getByLabel("Message", { exact: true });
  await composer.fill("Bring your notebook next time");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Bring your notebook next time")).toBeVisible();

  // THE CLAIM THIS TEST EXISTS FOR. Not "a chat pane works" — that the
  // pane is a window onto the SAME thread, so what is said mid-lesson is
  // still there afterwards, attributed to the person the SERVER says
  // wrote it, and stamped with the lesson it was said during.
  //
  // Polled, not read once: the bubble is OPTIMISTIC — it appears before
  // the server has written anything — so "it is on screen" is not yet
  // "it is stored". The row is the claim; the pane is a courtesy.
  await expect
    .poll(async () => (await threadMessagesFor(lessonId)).length, { timeout: 15_000 })
    .toBe(1);
  const stored = await threadMessagesFor(lessonId);
  expect(stored[0].body).toBe("Bring your notebook next time");
  expect(stored[0].author).toBe("teacher");
  expect(stored[0].lesson_id).toBe(lessonId);

  // --- receiving -------------------------------------------------------
  // The student's browser is the raw SDK, so it can put a payload on the
  // wire exactly as their app would. What is under test is OUR side of
  // it: decode, attribute to the other person, render.
  await student.evaluate(async (payload: string) => {
    const meeting = (window as unknown as { __meeting?: {
      chat: { sendCustomMessage: (m: { type: "custom"; message: string }) => Promise<void> };
    } }).__meeting;
    await meeting?.chat.sendCustomMessage({ type: "custom", message: payload });
  }, JSON.stringify({
    v: 1,
    id: "6f1d2c34-0b7a-4a1e-8c9d-2e5f7a8b9c01",
    body: "はい、持っていきます",
    createdAt: new Date().toISOString(),
  }));

  const received = page.getByText("はい、持っていきます");
  await expect(received).toBeVisible({ timeout: 30_000 });

  // Theirs, not ours: the bubble sits on the left. A payload cannot name
  // its own author, so this is the direction being read correctly.
  await expect(received).not.toHaveClass(/bg-accent/);

  await student.close();
  await resetCallLessons();
});

/**
 * The thread rows behind a lesson, read straight from the database.
 *
 * Local to this spec rather than in `helpers.ts`: the claim being tested
 * is that the CALL writes into the messages thread, and reading it here
 * keeps the two halves of that claim in one file.
 */
async function threadMessagesFor(
  lessonId: string,
): Promise<{ body: string; author: string; lesson_id: string | null }[]> {
  const db = postgres(
    process.env.DATABASE_URL ??
      "postgresql://classroom:classroom@localhost:5439/classroom",
    { max: 1 },
  );
  try {
    return await db<{ body: string; author: string; lesson_id: string | null }[]>`
      select m.body, m.author, m.lesson_id
      from messages m
      join message_threads t on t.id = m.thread_id
      join lessons l on l.student_id = t.student_id
      where l.id = ${lessonId}
      order by m.created_at asc
    `;
  } finally {
    await db.end();
  }
}

/** The recording's state and its tracks, as stored. */
async function storedTracks(lessonId: string): Promise<{
  state: string;
  tracks: {
    role: string;
    storage_key: string | null;
    sha256: string | null;
    bytes: number | null;
    transcribed_at: Date | null;
  }[];
}> {
  const db = postgres(
    process.env.DATABASE_URL ??
      "postgresql://classroom:classroom@localhost:5439/classroom",
    { max: 1 },
  );
  try {
    const [rec] = await db<{ id: string; state: string }[]>`
      select r.id, r.state from lesson_recordings r
      join lesson_calls c on c.id = r.call_id
      where c.lesson_id = ${lessonId}
      order by r.created_at desc limit 1`;
    const tracks = await db<
      {
        role: string;
        storage_key: string | null;
        sha256: string | null;
        bytes: number | null;
        transcribed_at: Date | null;
      }[]
    >`select role, storage_key, sha256, bytes, transcribed_at
      from lesson_recording_tracks where recording_id = ${rec.id}`;
    return { state: rec.state, tracks };
  } finally {
    await db.end();
  }
}

/** A signed HEAD straight at the bucket — the test's own eyes, not the ingest's. */
async function headObject(key: string): Promise<Response> {
  const endpoint =
    process.env.R2_ENDPOINT ??
    `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const signed = signRequest({
    method: "HEAD",
    url: `${endpoint}/${process.env.R2_BUCKET}/${key}`,
    region: process.env.R2_REGION ?? "auto",
    service: "s3",
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    payloadSha256: sha256Hex(""),
  });
  return fetch(signed.url, { method: "HEAD", headers: signed.headers });
}

type RawRecording = {
  status: string;
  download_url?: {
    links?: {
      download_urls?: Record<
        string,
        { download_url: string; custom_participant_id?: string | null }
      >;
    }[];
  };
};
