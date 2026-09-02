import { expect, test } from "@playwright/test";
import {
  composeExtractionInput,
  formatClock,
  placeOnTimeline,
  renderTranscript,
  trackStartFromFileName,
  utteranceLabel,
  utterancesFromSegments,
  type TimelineUtterance,
} from "../src/lib/transcript";

/**
 * FROM TWO VOICES TO ONE TRANSCRIPT, as pure logic — no browser, no
 * database, no transcriber. Same shape as `lesson-ingest.spec.ts`.
 *
 * What these guard is every DECISION between "two audio files were
 * transcribed" and "here is what was said in this lesson": where each
 * file sits on the clock, what counts as an utterance, how the merged
 * transcript reads to the extractor, and how the teacher's own notes
 * ride along without ever being written over. The I/O either side is
 * covered in `lesson-transcribe.db.spec.ts` (the orchestration, on the
 * real database) and the live-call tier (a real file, a real model).
 */

// The two file names the 2026-08-30 live call actually produced.
const TEACHER_FILE =
  "lesson_aaa1dd92-ac53-4f93-89a0-b951d5603be9_7b6bc743-8f9c-4032-9382-e5bf15646496_peer_audio_1788069291935.webm";
const STUDENT_FILE =
  "lesson_aaa9d3af-bcee-46b7-8c08-21c7e26c53e0_bbe60a69-d81b-4dcb-839b-acec95bd3e79_peer_audio_1788069291640.webm";

test("a track's start is read from the provider's file name, and only from a name that carries it", () => {
  expect(trackStartFromFileName(TEACHER_FILE)?.toISOString()).toBe(
    "2026-08-30T05:54:51.935Z",
  );
  expect(trackStartFromFileName(STUDENT_FILE)?.toISOString()).toBe(
    "2026-08-30T05:54:51.640Z",
  );
  // The 2026-09-02 live call stamped its files with FRACTIONAL
  // milliseconds — a second dot before the extension.
  expect(
    trackStartFromFileName(
      "lesson_aaa20898-9e4b-45ac-8817-201944498020_596ca73d-b331-45c4-ac2b-f992b1fe0e91_peer_audio_1788344160183.2737.webm",
    )?.toISOString(),
  ).toBe("2026-09-02T10:16:00.183Z");
  // The placeholder a track row carries before ingest, and a name that
  // does not follow the convention: null, never a plausible guess.
  expect(trackStartFromFileName("pending:rtk-teacher")).toBeNull();
  expect(trackStartFromFileName("lesson_a_b_1788069291640.webm")).toBeNull();
  expect(trackStartFromFileName("lesson_a_b_peer_audio_notatime.webm")).toBeNull();
});

test("segments become utterances: empty ones dropped, the rest numbered densely in milliseconds", () => {
  const drafts = utterancesFromSegments([
    { start: 0.5, end: 2.25, text: " こんにちは " },
    { start: 2.3, end: 2.3, text: "   " },
    { start: 3.0004, end: 2.9, text: "元気です" },
  ]);
  expect(drafts).toEqual([
    { sequence: 0, startMs: 500, endMs: 2250, text: "こんにちは" },
    // Sequence stays dense across the dropped one; an end before its
    // start is clamped rather than stored as a negative-length row.
    { sequence: 1, startMs: 3000, endMs: 3000, text: "元気です" },
  ]);
});

function utterance(
  role: "teacher" | "student",
  sequence: number,
  startMs: number,
  text: string,
  trackStartedAt: Date | null,
): TimelineUtterance {
  return {
    id: `${role}-${sequence}`,
    role,
    sequence,
    startMs,
    endMs: startMs + 1000,
    text,
    trackStartedAt,
  };
}

test("two separately transcribed voices land on one clock, offset by when each file began", () => {
  const teacherStart = new Date("2026-08-30T05:54:51.935Z");
  const studentStart = new Date("2026-08-30T05:54:51.640Z");
  const placed = placeOnTimeline(
    [
      utterance("teacher", 0, 1000, "How was your week?", teacherStart),
      utterance("teacher", 1, 8000, "Say it again slowly.", teacherStart),
      utterance("student", 0, 3000, "I go to Osaka.", studentStart),
      utterance("student", 1, 12000, "I went to Osaka.", studentStart),
    ],
    null,
  );

  expect(placed.map((u) => u.text)).toEqual([
    "How was your week?",
    "I go to Osaka.",
    "Say it again slowly.",
    "I went to Osaka.",
  ]);
  // The student's file began 295 ms earlier, so it is the origin; the
  // teacher's first line is 1000 ms into a file that began 295 ms later.
  expect(placed[0].atMs).toBe(1295);
  expect(placed[1].atMs).toBe(3000);
  expect(placed.map((u) => u.label)).toEqual(["T1", "S1", "T2", "S2"]);
});

test("a reconnect's second file lands minutes in, not at the top", () => {
  const start = new Date("2026-08-30T05:54:51.640Z");
  const rejoined = new Date(start.getTime() + 10 * 60_000);
  const placed = placeOnTimeline(
    [
      utterance("student", 0, 500, "before the drop", start),
      utterance("student", 0, 500, "after the drop", rejoined),
      utterance("teacher", 0, 300_000, "are you still there?", start),
    ],
    null,
  );
  expect(placed.map((u) => u.text)).toEqual([
    "before the drop",
    "are you still there?",
    "after the drop",
  ]);
  expect(placed[2].atMs).toBe(600_500);
});

test("a track whose start is unknown falls back to the recording's start; equal instants put the teacher first", () => {
  const recordingStart = new Date("2026-08-30T05:54:00.000Z");
  const placed = placeOnTimeline(
    [
      utterance("student", 0, 2000, "student", null),
      utterance("teacher", 0, 2000, "teacher", null),
    ],
    recordingStart,
  );
  expect(placed.map((u) => u.text)).toEqual(["teacher", "student"]);
  expect(placed.every((u) => u.atMs === 2000)).toBe(true);
});

test("labels and clocks read the way a person and a model both can", () => {
  expect(utteranceLabel("teacher", 0)).toBe("T1");
  expect(utteranceLabel("student", 11)).toBe("S12");
  expect(formatClock(0)).toBe("00:00");
  expect(formatClock(727_400)).toBe("12:07");
  expect(formatClock(3_735_000)).toBe("1:02:15");
});

test("the rendered transcript names the speaker on every line and carries the handle a claim can cite", () => {
  const start = new Date("2026-08-30T05:54:51.640Z");
  const placed = placeOnTimeline(
    [
      utterance("teacher", 0, 0, "How was your week?", start),
      utterance("student", 0, 4000, "I go to Osaka.", start),
    ],
    null,
  );
  expect(renderTranscript(placed, { teacher: "Teacher", student: "Kenji" })).toBe(
    "[T1] Teacher (00:00): How was your week?\n[S1] Kenji (00:04): I go to Osaka.",
  );
});

test("the teacher's notes ride along with the transcript, and re-composing never stacks a second copy", () => {
  const transcript = "[T1] Teacher (00:00): How was your week?";
  expect(composeExtractionInput(null, "")).toBe("");
  expect(composeExtractionInput("  she go -> she goes  ", "")).toBe(
    "she go -> she goes",
  );
  expect(composeExtractionInput(null, transcript)).toBe(
    `<transcript>\n${transcript}\n</transcript>`,
  );
  const both = composeExtractionInput("she go -> she goes", transcript);
  expect(both).toBe(
    `<teacher_notes>\nshe go -> she goes\n</teacher_notes>\n\n<transcript>\n${transcript}\n</transcript>`,
  );
  // The notes column is never the composed input, so composing again
  // from the same notes yields the same text — not notes + transcript
  // + transcript.
  expect(composeExtractionInput("she go -> she goes", transcript)).toBe(both);
});
