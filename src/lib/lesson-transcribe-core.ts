import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import {
  db,
  lessonCalls,
  lessonRecordings,
  lessonRecordingTracks,
  lessonUtterances,
  type LessonRecording,
  type LessonRecordingTrack,
} from "@/db";
import { CLAIM_LEASE_MS } from "@/lib/lesson-ingest-core";
import type { DraftOutcome } from "@/lib/lesson-draft";
import { sha256Hex } from "@/lib/s3-signature";
import {
  trackStartFromFileName,
  utterancesFromSegments,
  type TranscribedSegment,
} from "@/lib/transcript";

/**
 * FROM OUR AUDIO TO THE TEACHER'S DESK — what happens after `ingested`.
 *
 * Two steps, each its own state, each held under the same lease the
 * copy step uses:
 *
 *   ingested ──► transcribing ──► transcribed ──► extracting ──► awaiting_teacher_review ──► completed
 *
 * TRANSCRIBING reads each person's file back out of our bucket, proves
 * it is the file we stored (the digest on the track row), sends it to
 * the transcriber, and stores what came back as utterances — one row
 * per thing said, with the speaker as a FACT of which file it came from.
 * A track is marked `transcribed_at` only once every one of its rows is
 * stored, in the same transaction, so a re-run after a crash transcribes
 * exactly the tracks that are missing and none twice.
 *
 * EXTRACTING hands the whole lesson — every utterance on one clock, plus
 * whatever the teacher typed — to the draft loop that has existed since
 * the first pasted notes (`lib/lesson-draft.ts`). It writes a DRAFT.
 * Nothing here writes a correction, a word or an insight; the teacher's
 * approval does, and that is what `awaiting_teacher_review` waits for.
 *
 * WHAT IT REFUSES TO DO: start before `ingested` (the audio is not ours
 * until then); transcribe bytes that do not hash to what we stored;
 * mark a track done on a provider error; treat a missing API key as a
 * silent transcript (it is recorded on the row and retried by the
 * sweep, like a missing bucket is for the copy step).
 *
 * THE I/O IS INJECTED, exactly as in `lesson-ingest-core.ts`, so
 * `e2e/lesson-transcribe.db.spec.ts` runs the claim, the lease, a
 * partial failure and the hand-off to the draft loop against the real
 * database with a bucket, a transcriber and a drafter that do what each
 * test says.
 */

export type TranscriptDeps = {
  storage: {
    getLessonAudio: (
      key: string,
    ) => Promise<{ body: Buffer; contentType: string }>;
  };
  transcriber: {
    transcribeTrack: (args: {
      body: Buffer;
      contentType: string;
      fileName: string;
    }) => Promise<{
      model: string;
      durationSeconds: number | null;
      segments: TranscribedSegment[];
    }>;
  };
  drafter: {
    draftLesson: (args: {
      lessonId: string;
      teacherId: string;
    }) => Promise<DraftOutcome>;
  };
  /** What the environment has. Missing pieces are a recorded state, not a crash. */
  configured: () => { storage: boolean; transcriber: boolean };
  now?: () => Date;
};

export type TranscriptOutcome = {
  recordingId: string;
  state: LessonRecording["state"];
  /** Tracks transcribed on this pass. */
  transcribed: number;
  /** Whether a draft reached the lesson on this pass. */
  drafted: boolean;
  reason?: string;
};

export type TranscriptReport = {
  considered: number;
  transcribed: number;
  drafted: number;
  stillWaiting: number;
  failed: number;
};

/** The states this pipeline owns, in order. The sweep looks for exactly these. */
export const TRANSCRIPT_STATES: LessonRecording["state"][] = [
  "ingested",
  "transcribing",
  "transcribed",
  "extracting",
];

export function createTranscriptPipeline(deps: TranscriptDeps) {
  const now = deps.now ?? (() => new Date());

  /**
   * Take one recording as far as it can go right now.
   *
   * Safe to call from the webhook's tail and the sweep at once: each
   * step is entered through a conditional UPDATE that only one caller
   * can win, and a step that finds nothing left to do says so.
   */
  async function processRecording(
    recordingId: string,
  ): Promise<TranscriptOutcome> {
    let recording = await db.query.lessonRecordings.findFirst({
      where: eq(lessonRecordings.id, recordingId),
    });
    if (!recording) throw new Error(`no such recording ${recordingId}`);

    let transcribed = 0;
    if (recording.state === "ingested" || recording.state === "transcribing") {
      const step = await transcribeStep(recording);
      transcribed = step.transcribed;
      if (step.state !== "transcribed") return step;
      recording = (await db.query.lessonRecordings.findFirst({
        where: eq(lessonRecordings.id, recordingId),
      }))!;
    }

    if (recording.state === "transcribed" || recording.state === "extracting") {
      const step = await extractStep(recording);
      return { ...step, transcribed };
    }

    return unchanged(recording, `nothing to do in state ${recording.state}`);
  }

  /**
   * The safety net, on the sweep's clock: every recording that is ours
   * and not yet on the teacher's desk.
   */
  async function reconcileTranscripts(): Promise<TranscriptReport> {
    const candidates = await db
      .select()
      .from(lessonRecordings)
      .where(inArray(lessonRecordings.state, TRANSCRIPT_STATES));

    const report: TranscriptReport = {
      considered: candidates.length,
      transcribed: 0,
      drafted: 0,
      stillWaiting: 0,
      failed: 0,
    };
    // Sequential, like the copy sweep: each pass holds a whole audio
    // file in memory and waits on a model.
    for (const row of candidates) {
      try {
        const outcome = await processRecording(row.id);
        report.transcribed += outcome.transcribed;
        if (outcome.drafted) report.drafted += 1;
        if (outcome.state === "failed") report.failed += 1;
        else if (
          outcome.state !== "awaiting_teacher_review" &&
          outcome.state !== "completed"
        ) {
          report.stillWaiting += 1;
        }
      } catch (error) {
        console.error(`[transcript] reconcile: ${row.id} threw`, error);
        report.failed += 1;
      }
    }
    return report;
  }

  // -------------------------------------------------------------------------

  async function transcribeStep(
    recording: LessonRecording,
  ): Promise<TranscriptOutcome> {
    const have = deps.configured();
    if (!have.storage || !have.transcriber) {
      const reason = !have.storage
        ? "lesson audio storage is not configured — cannot read the recording back"
        : "lesson transcription is not configured — set OPENAI_API_KEY";
      console.error(`[transcript] ${recording.id}: ${reason}`);
      await note(recording.id, { failureReason: reason });
      return unchanged(recording, reason);
    }

    if (!(await claim(recording, "ingested", "transcribing"))) {
      return unchanged(
        recording,
        "another worker is already transcribing this recording",
      );
    }

    const tracks = await db
      .select()
      .from(lessonRecordingTracks)
      .where(eq(lessonRecordingTracks.recordingId, recording.id));

    let transcribed = 0;
    const errors: string[] = [];
    for (const track of tracks) {
      if (track.transcribedAt) continue;
      if (!track.storageKey) {
        // Cannot happen past `ingested`, which is only set once every
        // track is stored — said out loud rather than skipped, because
        // a lesson half-transcribed in silence is the failure this file
        // exists to prevent.
        errors.push(`${track.providerFileName}: not in our bucket`);
        continue;
      }
      try {
        await transcribeTrack(track);
        transcribed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(
          `[transcript] ${recording.id}: ${track.providerFileName} failed — ${message}`,
        );
        errors.push(`${track.providerFileName}: ${message}`);
      }
    }

    const pending = await db
      .select({ id: lessonRecordingTracks.id })
      .from(lessonRecordingTracks)
      .where(
        and(
          eq(lessonRecordingTracks.recordingId, recording.id),
          isNull(lessonRecordingTracks.transcribedAt),
        ),
      );

    if (pending.length === 0) {
      await note(
        recording.id,
        { state: "transcribed", failureReason: null },
        { holding: true },
      );
      return { recordingId: recording.id, state: "transcribed", transcribed, drafted: false };
    }

    // Left in `transcribing`: the truth (started, not finished), and a
    // state the sweep looks for. The lease ages and the row is retaken.
    const reason = `${pending.length} track(s) not transcribed${errors.length ? ` · errors: ${errors.join("; ")}` : ""}`;
    await note(recording.id, { failureReason: reason }, { holding: true });
    return { recordingId: recording.id, state: "transcribing", transcribed, drafted: false, reason };
  }

  /**
   * One person's file: read back, proven, transcribed, stored.
   *
   * The digest check is not paranoia about R2. It is the one moment the
   * pipeline can notice that the bytes it is about to turn into a
   * lesson are not the bytes it verified on the way in — a bucket
   * rewritten by hand, a key reused, a wrong environment — and a
   * transcript of the wrong audio under the right lesson would survive
   * every later check.
   */
  async function transcribeTrack(track: LessonRecordingTrack): Promise<void> {
    const audio = await deps.storage.getLessonAudio(track.storageKey!);
    const digest = sha256Hex(audio.body);
    if (track.sha256 && digest !== track.sha256) {
      throw new Error(
        `the bytes in our bucket do not match what we stored (sha256 ${digest.slice(0, 12)}… vs ${track.sha256.slice(0, 12)}…)`,
      );
    }

    const result = await deps.transcriber.transcribeTrack({
      body: audio.body,
      contentType: audio.contentType,
      fileName: track.providerFileName,
    });
    const drafts = utterancesFromSegments(result.segments);

    await db.transaction(async (tx) => {
      // Replace, never append: a second pass over the same track must
      // leave exactly one transcription of it.
      await tx.delete(lessonUtterances).where(eq(lessonUtterances.trackId, track.id));
      if (drafts.length > 0) {
        await tx.insert(lessonUtterances).values(
          drafts.map((d) => ({
            recordingId: track.recordingId,
            trackId: track.id,
            role: track.role,
            sequence: d.sequence,
            startMs: d.startMs,
            endMs: d.endMs,
            text: d.text,
          })),
        );
      }
      await tx
        .update(lessonRecordingTracks)
        .set({
          transcribedAt: now(),
          transcriptModel: result.model,
          startedAt: track.startedAt ?? trackStartFromFileName(track.providerFileName),
        })
        .where(eq(lessonRecordingTracks.id, track.id));
    });
  }

  async function extractStep(
    recording: LessonRecording,
  ): Promise<TranscriptOutcome> {
    if (!(await claim(recording, "transcribed", "extracting"))) {
      return unchanged(
        recording,
        "another worker is already drafting this recording",
      );
    }

    const call = await db.query.lessonCalls.findFirst({
      where: eq(lessonCalls.id, recording.callId),
    });
    if (!call) throw new Error(`recording ${recording.id} has no call`);

    let outcome: DraftOutcome;
    try {
      outcome = await deps.drafter.draftLesson({
        lessonId: call.lessonId,
        teacherId: call.teacherId,
      });
    } catch (error) {
      // A model outage is a retry, on the sweep's clock. The row stays
      // in `extracting` with the reason, and is retaken once the lease
      // ages — nothing about the transcript needs redoing.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[transcript] ${recording.id}: drafting threw — ${message}`);
      await note(recording.id, { failureReason: message }, { holding: true });
      return { recordingId: recording.id, state: "extracting", transcribed: 0, drafted: false, reason: message };
    }

    if (!outcome.ok) {
      // Nothing to extract from — a recording that transcribed to
      // silence and a lesson with no notes. Not a retry: the audio will
      // not grow words. Ended, with the reason on the row where the
      // lesson page can show it.
      console.error(`[transcript] ${recording.id}: ${outcome.error}`);
      await note(
        recording.id,
        { state: "completed", failureReason: outcome.error },
        { holding: true },
      );
      return { recordingId: recording.id, state: "completed", transcribed: 0, drafted: false, reason: outcome.error };
    }

    await note(
      recording.id,
      { state: "awaiting_teacher_review", failureReason: null },
      { holding: true },
    );
    return { recordingId: recording.id, state: "awaiting_teacher_review", transcribed: 0, drafted: true };
  }

  /**
   * Enter a step, or discover someone else is in it.
   *
   * Same shape as the copy step's claim: from the resting state, or from
   * the working state once the worker that held it has been silent for
   * longer than the lease. `updated_at` is the lease clock and only
   * moves through `note(…, { holding: true })`.
   */
  async function claim(
    recording: LessonRecording,
    from: LessonRecording["state"],
    to: LessonRecording["state"],
  ): Promise<boolean> {
    const at = now();
    const [row] = await db
      .update(lessonRecordings)
      .set({ state: to, updatedAt: at })
      .where(
        and(
          eq(lessonRecordings.id, recording.id),
          or(
            eq(lessonRecordings.state, from),
            and(
              eq(lessonRecordings.state, to),
              lt(
                lessonRecordings.updatedAt,
                new Date(at.getTime() - CLAIM_LEASE_MS),
              ),
            ),
          ),
        ),
      )
      .returning({ id: lessonRecordings.id });
    return Boolean(row);
  }

  async function note(
    recordingId: string,
    fields: Partial<{
      state: LessonRecording["state"];
      failureReason: string | null;
    }>,
    opts: { holding?: boolean } = {},
  ): Promise<void> {
    await db
      .update(lessonRecordings)
      .set(opts.holding ? { ...fields, updatedAt: now() } : fields)
      .where(eq(lessonRecordings.id, recordingId));
  }

  return { processRecording, reconcileTranscripts };
}

/**
 * The teacher has decided about the draft — approved it or thrown it
 * away — and the recording's pipeline is over. Called from the lesson
 * actions, so it is narrowed to the one lesson the caller was already
 * proven to own; it moves only rows that were waiting for exactly this.
 */
export async function markRecordingReviewed(lessonId: string): Promise<void> {
  const call = await db.query.lessonCalls.findFirst({
    where: eq(lessonCalls.lessonId, lessonId),
    columns: { id: true },
  });
  if (!call) return;
  await db
    .update(lessonRecordings)
    .set({ state: "completed", updatedAt: new Date() })
    .where(
      and(
        eq(lessonRecordings.callId, call.id),
        eq(lessonRecordings.state, "awaiting_teacher_review"),
      ),
    );
}

function unchanged(recording: LessonRecording, reason: string): TranscriptOutcome {
  return {
    recordingId: recording.id,
    state: recording.state,
    transcribed: 0,
    drafted: false,
    reason,
  };
}
