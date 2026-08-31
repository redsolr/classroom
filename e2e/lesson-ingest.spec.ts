import { expect, test } from "@playwright/test";
import { sha256Hex, signRequest } from "../src/lib/s3-signature";
import {
  attributeFiles,
  describeMissing,
  parseRecordingManifest,
  participantIdFromFileName,
  type TrackForMatching,
} from "../src/lib/recording-manifest";

/**
 * LESSON AUDIO INGESTION, as pure logic — no browser, no provider, no
 * bucket. Same shape as `note-blocks.spec.ts`: this repo has no unit-test
 * runner, and a Playwright spec that never touches `page` simply runs in
 * Node.
 *
 * What these guard is everything in the pipeline that is a DECISION
 * rather than an I/O call, because the decisions are where a lesson gets
 * lost quietly:
 *
 *  - whose voice a file is (attribution), where being wrong means storing
 *    one person's audio under another's name;
 *  - whether a recording is fully ours (completeness), which is the only
 *    thing allowed to advance the state machine past `ingested`;
 *  - the request signature, where being wrong means every copy fails.
 *
 * The I/O either side of them is covered where it can only honestly be
 * covered: `lesson-call.live-call.spec.ts` runs a real call, a real
 * recording and a real copy into R2.
 */

// ---------------------------------------------------------------------------
// Request signing
// ---------------------------------------------------------------------------

/**
 * A KNOWN ANSWER, not a re-derivation.
 *
 * The expected value was produced by a REFERENCE SigV4 implementation
 * (the AWS SDK's signer, run once as an oracle while developing — it is
 * not a dependency of this app), over this exact request. The same signer
 * was then proven against a real S3 server: PUT accepted, ETag matching
 * the MD5 we sent, 404 on a key that is not there. A test that recomputed
 * the signature with the code it is testing would pass on a broken signer.
 */
test("the request signature matches a reference SigV4 implementation", () => {
  const signed = signRequest({
    method: "PUT",
    url: "https://acct.r2.cloudflarestorage.com/bucket/lessons/abc/def/lesson_x_y_peer_audio_1.webm",
    region: "auto",
    service: "s3",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
    payloadSha256: sha256Hex(Buffer.from("hello lesson audio")),
    headers: { "content-type": "audio/webm" },
    now: new Date("2015-08-30T12:36:00Z"),
  });

  expect(signed.headers.Authorization).toBe(
    "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/auto/s3/aws4_request, " +
      "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, " +
      "Signature=e325b1e63ba26f5bcc7dce427a871c7dd358dea5c747895fab41c7da570bd036",
  );
  // The payload digest is signed AND sent: a proxy that rewrote the body
  // would fail the signature rather than store something else.
  expect(signed.headers["x-amz-content-sha256"]).toBe(
    sha256Hex(Buffer.from("hello lesson audio")),
  );
});

// ---------------------------------------------------------------------------
// Reading the provider's manifest
// ---------------------------------------------------------------------------

const REAL_SHAPE = {
  data: {
    recording: {
      id: "rec_1",
      status: "UPLOADED",
      recordingDuration: 121.4,
      download_url: {
        links: [
          {
            download_urls: {
              "lesson_rtk-teacher_peer-1_peer_audio_1760000000000.webm": {
                download_url: "https://provider.example/teacher.webm?sig=1",
                custom_participant_id: "teacher:11111111-1111-1111-1111-111111111111",
              },
              "lesson_rtk-student_peer-2_peer_audio_1760000000001.webm": {
                download_url: "https://provider.example/student.webm?sig=2",
                custom_participant_id: "student:22222222-2222-2222-2222-222222222222",
              },
            },
          },
        ],
      },
      download_url_expiry: "2026-09-07T10:00:00.000Z",
    },
  },
};

test("the manifest is read from the shape the API actually returns", () => {
  const manifest = parseRecordingManifest(REAL_SHAPE);

  expect(manifest.status).toBe("UPLOADED");
  expect(manifest.durationSeconds).toBe(121);
  expect(manifest.expiresAt?.toISOString()).toBe("2026-09-07T10:00:00.000Z");
  expect(manifest.files).toHaveLength(2);
  expect(manifest.files[0]).toEqual({
    fileName: "lesson_rtk-teacher_peer-1_peer_audio_1760000000000.webm",
    downloadUrl: "https://provider.example/teacher.webm?sig=1",
    customParticipantId: "teacher:11111111-1111-1111-1111-111111111111",
    // Read out of the file name, independently of the field above.
    providerParticipantId: "rtk-teacher",
  });
});

test("the manifest is also read from the shape the docs publish", () => {
  // `download_url` as a bare array of layers, no `custom_participant_id`
  // anywhere — the documented example. Attribution then has to come from
  // the file name alone, which is why it is parsed at all.
  const manifest = parseRecordingManifest({
    data: {
      status: "uploaded",
      download_url: [
        {
          layer_name: "default",
          download_urls: {
            "speaker_user-123_peer-456_peer_audio_1760000000000.webm": {
              download_url: "https://provider.example/a.webm",
            },
          },
        },
      ],
    },
  });

  expect(manifest.status).toBe("UPLOADED");
  expect(manifest.files).toHaveLength(1);
  expect(manifest.files[0].customParticipantId).toBeNull();
  expect(manifest.files[0].providerParticipantId).toBe("user-123");
});

test("a recording with nothing in it parses as a recording with nothing in it", () => {
  // The most dangerous payload the provider produces: UPLOADED, a real
  // duration, no error, and zero files. Nothing here may invent one.
  const manifest = parseRecordingManifest({
    data: { status: "UPLOADED", recordingDuration: 121, download_url: null },
  });
  expect(manifest.status).toBe("UPLOADED");
  expect(manifest.files).toEqual([]);
});

test("a file name that does not follow the convention yields no id", () => {
  expect(
    participantIdFromFileName("lesson_rtk-1_peer-2_peer_audio_1760000000000.webm"),
  ).toBe("rtk-1");
  // Too few segments to be sure which one is the participant — null, not
  // a plausible-looking fragment.
  expect(participantIdFromFileName("recording.webm")).toBeNull();
  expect(participantIdFromFileName("lesson_rtk-1_audio.webm")).toBeNull();
});

// ---------------------------------------------------------------------------
// Whose voice is this?
// ---------------------------------------------------------------------------

const TEACHER = "teacher:11111111-1111-1111-1111-111111111111";
const STUDENT = "student:22222222-2222-2222-2222-222222222222";

/** The rows `startLessonRecording` writes: one per person, name pending. */
function pendingTracks(): TrackForMatching[] {
  return [
    {
      id: "track-teacher",
      role: "teacher",
      providerParticipantId: "rtk-teacher",
      providerFileName: "pending:rtk-teacher",
      storageKey: null,
    },
    {
      id: "track-student",
      role: "student",
      providerParticipantId: "rtk-student",
      providerFileName: "pending:rtk-student",
      storageKey: null,
    },
  ];
}

test("each file lands on the row for the person who spoke it", () => {
  const plan = attributeFiles(
    parseRecordingManifest(REAL_SHAPE).files,
    pendingTracks(),
  );

  expect(plan.map((p) => p.kind)).toEqual(["copy", "copy"]);
  expect(plan).toMatchObject([
    { role: "teacher", trackId: "track-teacher" },
    { role: "student", trackId: "track-student" },
  ]);
});

test("a file we cannot attribute is never copied to a default", () => {
  // A recording started by something else on the same RealtimeKit app,
  // or an id format that changed under us. Either way the answer is "we
  // do not know whose voice this is" — storing it under one of our
  // people would be a privacy incident, where skipping it is a retry.
  const plan = attributeFiles(
    [
      {
        fileName: "lesson_someone-else_peer-9_peer_audio_1.webm",
        downloadUrl: "https://provider.example/x.webm",
        customParticipantId: "moderator:99",
        providerParticipantId: "someone-else",
      },
      {
        fileName: "mystery.webm",
        downloadUrl: "https://provider.example/y.webm",
        customParticipantId: null,
        providerParticipantId: null,
      },
    ],
    pendingTracks(),
  );

  expect(plan.map((p) => p.kind)).toEqual(["unattributable", "unattributable"]);
});

test("the file name attributes a file when the provider stops echoing our id", () => {
  const plan = attributeFiles(
    [
      {
        fileName: "lesson_rtk-student_peer-2_peer_audio_1.webm",
        downloadUrl: "https://provider.example/s.webm",
        customParticipantId: null,
        providerParticipantId: "rtk-student",
      },
    ],
    pendingTracks(),
  );

  expect(plan[0]).toMatchObject({
    kind: "copy",
    role: "student",
    trackId: "track-student",
  });
});

test("a reconnect gets its own row rather than overwriting the first", () => {
  // Every join mints a fresh provider participant, so one person who
  // dropped and came back produces two files. Both halves of their voice
  // are the lesson.
  const tracks = pendingTracks();
  const plan = attributeFiles(
    [
      {
        fileName: "lesson_rtk-teacher_peer-1_peer_audio_1.webm",
        downloadUrl: "https://provider.example/t1.webm",
        customParticipantId: TEACHER,
        providerParticipantId: "rtk-teacher",
      },
      {
        fileName: "lesson_rtk-teacher-2_peer-3_peer_audio_2.webm",
        downloadUrl: "https://provider.example/t2.webm",
        customParticipantId: TEACHER,
        providerParticipantId: "rtk-teacher-2",
      },
      {
        fileName: "lesson_rtk-student_peer-2_peer_audio_3.webm",
        downloadUrl: "https://provider.example/s.webm",
        customParticipantId: STUDENT,
        providerParticipantId: "rtk-student",
      },
    ],
    tracks,
  );

  expect(plan).toMatchObject([
    { kind: "copy", role: "teacher", trackId: "track-teacher" },
    { kind: "copy", role: "teacher", trackId: null },
    { kind: "copy", role: "student", trackId: "track-student" },
  ]);
});

test("a file already in our bucket is not fetched twice", () => {
  // What makes a retry cheap and a double-delivery harmless.
  const tracks = pendingTracks();
  tracks[0].providerFileName =
    "lesson_rtk-teacher_peer-1_peer_audio_1760000000000.webm";
  tracks[0].storageKey = "lessons/l/r/teacher.webm";

  const plan = attributeFiles(parseRecordingManifest(REAL_SHAPE).files, tracks);

  expect(plan[0]).toMatchObject({ kind: "done", trackId: "track-teacher" });
  expect(plan[1]).toMatchObject({ kind: "copy", role: "student" });
});

// ---------------------------------------------------------------------------
// Is the lesson ours yet?
// ---------------------------------------------------------------------------

test("one voice stored is not an ingested lesson", () => {
  const tracks = pendingTracks();
  tracks[0].storageKey = "lessons/l/r/teacher.webm";

  const missing = describeMissing(tracks, { expectedTrackCount: 2 }, [], []);
  expect(missing).toContain("only teacher audio is stored");
});

test("a recording is ingested only when every expected person is in our bucket", () => {
  const tracks = pendingTracks();
  tracks[0].storageKey = "lessons/l/r/teacher.webm";
  tracks[1].storageKey = "lessons/l/r/student.webm";

  expect(describeMissing(tracks, { expectedTrackCount: 2 }, [], [])).toBeNull();
});

test("an uncopied track keeps the lesson out of ingested, even with both voices", () => {
  // The reconnect case again: three rows, two people, one copy failed.
  // Both roles are represented, and the lesson is still not all here.
  const tracks = [
    ...pendingTracks().map((t) => ({ ...t, storageKey: `lessons/l/r/${t.id}.webm` })),
    {
      id: "track-teacher-2",
      role: "teacher" as const,
      providerParticipantId: "rtk-teacher-2",
      providerFileName: "lesson_rtk-teacher-2_peer-3_peer_audio_2.webm",
      storageKey: null,
    },
  ];

  expect(describeMissing(tracks, { expectedTrackCount: 2 }, [], [])).toBe(
    "1 expected track(s) not copied",
  );
});

test("a copy error and an unattributable file both keep the reason", () => {
  const missing = describeMissing(
    pendingTracks(),
    { expectedTrackCount: 2 },
    ["mystery.webm: no participant id on the file or in its name"],
    ["lesson_rtk-student_peer-2_peer_audio_1.webm: the link may have expired"],
  );

  expect(missing).toContain("no track file has been copied");
  expect(missing).toContain("unattributable: mystery.webm");
  expect(missing).toContain("the link may have expired");
});
