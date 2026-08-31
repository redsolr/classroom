import "server-only";
import { and, eq, inArray, lt, or } from "drizzle-orm";
import {
  db,
  lessonCalls,
  lessonRecordings,
  lessonRecordingTracks,
  type LessonRecording,
} from "@/db";
import {
  attributeFiles,
  describeMissing,
  type TrackForMatching,
} from "@/lib/recording-manifest";
import {
  downloadTrackFile,
  fetchRecording,
  realtimeKitConfigured,
} from "@/lib/realtimekit";
import { lessonAudioKey, putLessonAudio, r2Configured } from "@/lib/r2";

/**
 * OWNING THE ARTIFACT — copying a finished lesson out of the provider's
 * bucket and into ours.
 *
 * This is the step that makes a recorded lesson OURS. RealtimeKit keeps
 * track files behind presigned URLs that expire after SEVEN DAYS: until
 * the bytes are in our own storage and checksummed, every lesson we have
 * recorded is on a countdown, and nothing downstream — transcription,
 * utterances, learning artifacts — may start against an artifact we do
 * not hold.
 *
 * FOUR PROPERTIES, each the answer to a way this loses a lesson:
 *
 *  1. IT ASKS, IT DOES NOT REPLAY. The `UPLOADED` webhook carries the
 *     expiry but not the download URLs, so the pipeline is always
 *     webhook → fetch → copy. That is also what lets the reconciler find
 *     a recording whose webhook never arrived at all.
 *  2. IT VERIFIES. A 200 is not a copy. Every file is hashed, its length
 *     compared with what the provider declared, the store's ETag matched
 *     against the same bytes, and its length read back from our bucket.
 *  3. IT RETRIES ON ITS OWN CLOCK. Ingestion is independent of anything
 *     downstream: a transcription failure must never stop the bytes being
 *     saved, and a storage failure must never be retried by whoever
 *     wanted a transcript. The daily sweep is the retry.
 *  4. IT ONLY ADVANCES ON PROOF. `ingested` is set when every expected
 *     person's audio is in our bucket — never on "the provider said
 *     UPLOADED", which it says about recordings containing nothing.
 *
 * NO ATTEMPT COUNTER, deliberately. Retries are paced by the sweep that
 * runs them (daily) and bounded by the thing that actually ends them
 * (the provider's expiry, below) — so a counter column would only be a
 * second, weaker answer to a question `updated_at` and `failure_reason`
 * already answer, and a schema change for a number nothing reads.
 */

/**
 * A recording another worker took this recently is left alone; one taken
 * longer ago than this was abandoned mid-copy and may be taken again.
 * The webhook and the sweep firing together is the case this is for.
 */
const CLAIM_LEASE_MS = 15 * 60_000;

/** How long before the provider's copy dies we start saying so. */
const EXPIRY_ALERT_MS = 48 * 60 * 60_000;

/**
 * A recording still marked `recording` this long after it started never
 * got a stop or a webhook — a closed laptop, a lost delivery. The
 * provider ends its own session on idle, so asking is how we find out.
 */
const STALE_RECORDING_MS = 2 * 60 * 60_000;

export type IngestOutcome = {
  recordingId: string;
  state: string;
  copied: number;
  alreadyStored: number;
  /** Files the provider produced that belong to nobody we know. */
  unattributable: string[];
  reason?: string;
};

/**
 * Copy one recording's track files into our bucket.
 *
 * Safe to call twice, from the webhook and the reconciler at once: taking
 * the row into `ingesting` IS the lock, and a file already stored is
 * recognised and skipped rather than fetched again.
 */
export async function ingestRecording(
  recordingId: string,
): Promise<IngestOutcome> {
  const recording = await db.query.lessonRecordings.findFirst({
    where: eq(lessonRecordings.id, recordingId),
  });
  if (!recording) throw new Error(`no such recording ${recordingId}`);
  if (recording.state === "ingested") {
    return unchanged(recording, "already ingested");
  }

  // Configuration is a real, recoverable state, not a crash: the row is
  // marked with WHY nothing happened and picked up again once the
  // environment has what it needs. Silence here would be a lesson
  // quietly not copied.
  if (!realtimeKitConfigured() || !r2Configured()) {
    const reason = !realtimeKitConfigured()
      ? "RealtimeKit is not configured — cannot fetch the recording"
      : "lesson audio storage is not configured — set R2_BUCKET and its credentials";
    console.error(`[ingest] ${recording.id}: ${reason}`);
    await note(recording.id, { failureReason: reason });
    return unchanged(recording, reason);
  }

  const claimed = await claim(recording);
  if (!claimed) {
    return unchanged(
      recording,
      "another worker is already ingesting this recording",
    );
  }

  let manifest;
  try {
    manifest = await fetchRecording(recording.providerRecordingId);
  } catch (error) {
    // Put the row back where it was: `ingesting` would claim work that
    // never started, and the next sweep should find it in its real state.
    const message = error instanceof Error ? error.message : String(error);
    await note(recording.id, { state: recording.state, failureReason: message });
    throw error;
  }

  // What the provider knows that we did not: how long it ran, and when
  // its own copy dies. Stored on every pass, including passes that copy
  // nothing, so the expiry alarm is armed even while ingestion is stuck.
  await note(recording.id, {
    durationSeconds: manifest.durationSeconds ?? recording.durationSeconds,
    providerExpiresAt: manifest.expiresAt ?? recording.providerExpiresAt,
  });

  if (manifest.status === "ERRORED") {
    const reason = "the provider reported the recording as ERRORED";
    await note(recording.id, { state: "failed", failureReason: reason });
    return { ...unchanged(recording, reason), state: "failed" };
  }
  if (manifest.status !== "UPLOADED") {
    // Not finished yet. Nothing is wrong; the sweep will be back.
    await note(recording.id, { state: recording.state });
    return unchanged(
      recording,
      `provider status is ${manifest.status ?? "unknown"}`,
    );
  }

  const expiresAt = manifest.expiresAt ?? recording.providerExpiresAt;
  if (
    manifest.files.length === 0 &&
    expiresAt !== null &&
    expiresAt.getTime() < Date.now()
  ) {
    // Nothing left to copy. This is the loss the whole pipeline exists to
    // prevent, so it is recorded as a failure rather than retried forever.
    const reason = `the provider's copy expired on ${expiresAt.toISOString()} before we copied it`;
    console.error(`[ingest] ${recording.id}: ${reason}`);
    await note(recording.id, { state: "failed", failureReason: reason });
    return { ...unchanged(recording, reason), state: "failed" };
  }

  const call = await db.query.lessonCalls.findFirst({
    where: eq(lessonCalls.id, recording.callId),
  });
  if (!call) throw new Error(`recording ${recording.id} has no call`);

  const tracks = await loadTracks(recording.id);
  const plan = attributeFiles(manifest.files, tracks);

  let copied = 0;
  let alreadyStored = 0;
  const unattributable: string[] = [];
  const errors: string[] = [];

  for (const item of plan) {
    if (item.kind === "done") {
      alreadyStored += 1;
      continue;
    }
    if (item.kind === "unattributable") {
      // Never copied to a default. Storing a lesson's audio under the
      // wrong person is a privacy incident; not storing it is a retry.
      console.error(
        `[ingest] ${recording.id}: ${item.file.fileName} is unattributable — ${item.reason}`,
      );
      unattributable.push(`${item.file.fileName}: ${item.reason}`);
      continue;
    }

    try {
      const { body, contentType } = await downloadTrackFile(item.file.downloadUrl);
      const stored = await putLessonAudio({
        key: lessonAudioKey({
          lessonId: call.lessonId,
          recordingId: recording.id,
          fileName: item.file.fileName,
        }),
        body,
        contentType,
      });

      if (item.trackId) {
        await db
          .update(lessonRecordingTracks)
          .set({
            providerFileName: item.file.fileName,
            storageKey: stored.key,
            bytes: stored.bytes,
            sha256: stored.sha256,
          })
          .where(eq(lessonRecordingTracks.id, item.trackId));
      } else {
        // A second file for someone who already has one — a reconnect
        // mid-lesson does exactly that. Both halves of their voice are
        // the lesson, so it gets its own row rather than overwriting.
        await db
          .insert(lessonRecordingTracks)
          .values({
            recordingId: recording.id,
            role: item.role,
            providerParticipantId:
              item.file.providerParticipantId ??
              tracks.find((t) => t.role === item.role)?.providerParticipantId ??
              "unknown",
            providerFileName: item.file.fileName,
            storageKey: stored.key,
            bytes: stored.bytes,
            sha256: stored.sha256,
          })
          .onConflictDoNothing({
            target: [
              lessonRecordingTracks.recordingId,
              lessonRecordingTracks.providerFileName,
            ],
          });
      }
      copied += 1;
    } catch (error) {
      // Per file, so one bad link does not cost the other person's audio.
      // Whatever succeeded stays stored and is skipped on the next pass.
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[ingest] ${recording.id}: copying ${item.file.fileName} failed — ${message}`,
      );
      errors.push(`${item.file.fileName}: ${message}`);
    }
  }

  const missing = describeMissing(
    await loadTracks(recording.id),
    recording,
    unattributable,
    errors,
  );

  if (!missing) {
    await note(recording.id, {
      state: "ingested",
      ingestedAt: new Date(),
      failureReason: null,
    });
    return {
      recordingId: recording.id,
      state: "ingested",
      copied,
      alreadyStored,
      unattributable,
    };
  }

  // Left in `ingesting` deliberately: it is a state the sweep looks for,
  // and it says the truth — started, not finished.
  await note(recording.id, { failureReason: missing });
  return {
    recordingId: recording.id,
    state: "ingesting",
    copied,
    alreadyStored,
    unattributable,
    reason: missing,
  };
}

export type ReconcileReport = {
  considered: number;
  ingested: number;
  stillWaiting: number;
  failed: number;
  /** Recordings whose provider copy dies soon and is still not ours. */
  expiringSoon: { recordingId: string; expiresAt: string; state: string }[];
};

/**
 * The safety net: every recording that finished and is not ours yet.
 *
 * It exists because a webhook is a delivery, not a guarantee — one can be
 * lost, arrive while we are deploying, or never be sent at all because a
 * laptop closed and the session timed out on the provider's side.
 * Anything the live path missed has seven days of sweeps to be picked up,
 * and anything running out of that window is named LOUDLY rather than
 * discovered as a gap afterwards.
 */
export async function reconcileRecordings(): Promise<ReconcileReport> {
  const now = new Date();
  const candidates = await db
    .select()
    .from(lessonRecordings)
    .where(
      or(
        inArray(lessonRecordings.state, ["recording_complete", "ingesting"]),
        // A room nobody stopped. Ignored until the provider has had time
        // to end its own session, then asked about like any other.
        and(
          eq(lessonRecordings.state, "recording"),
          lt(
            lessonRecordings.startedAt,
            new Date(now.getTime() - STALE_RECORDING_MS),
          ),
        ),
      ),
    );

  let ingested = 0;
  let failed = 0;
  let stillWaiting = 0;

  // Sequential on purpose: each pass downloads whole audio files into
  // memory, and a parallel sweep would multiply that by however many
  // lessons happened to finish at once.
  for (const row of candidates) {
    try {
      const outcome = await ingestRecording(row.id);
      if (outcome.state === "ingested") ingested += 1;
      else if (outcome.state === "failed") failed += 1;
      else stillWaiting += 1;
    } catch (error) {
      console.error(`[ingest] reconcile: ${row.id} threw`, error);
      failed += 1;
    }
  }

  const expiringSoon = candidates
    .filter(
      (row) =>
        row.providerExpiresAt !== null &&
        row.providerExpiresAt.getTime() - now.getTime() < EXPIRY_ALERT_MS,
    )
    .map((row) => ({
      recordingId: row.id,
      expiresAt: row.providerExpiresAt!.toISOString(),
      state: row.state,
    }));
  for (const row of expiringSoon) {
    // The one thing here worth waking someone for: audio that is still
    // not ours and is about to stop existing.
    console.error(
      `[ingest] ALERT recording ${row.recordingId} is still ${row.state} and the provider's copy expires ${row.expiresAt}`,
    );
  }

  return { considered: candidates.length, ingested, stillWaiting, failed, expiringSoon };
}

// ---------------------------------------------------------------------------

/**
 * Take the row, or discover someone else has it.
 *
 * Moving it into `ingesting` IS the lock — a conditional UPDATE, so two
 * workers cannot both win — and the lease is what stops a process that
 * died mid-copy from parking a lesson in `ingesting` forever.
 */
async function claim(recording: LessonRecording): Promise<boolean> {
  const now = new Date();
  const [row] = await db
    .update(lessonRecordings)
    .set({ state: "ingesting", updatedAt: now })
    .where(
      and(
        eq(lessonRecordings.id, recording.id),
        or(
          inArray(lessonRecordings.state, ["recording", "recording_complete"]),
          and(
            eq(lessonRecordings.state, "ingesting"),
            lt(
              lessonRecordings.updatedAt,
              new Date(now.getTime() - CLAIM_LEASE_MS),
            ),
          ),
        ),
      ),
    )
    .returning({ id: lessonRecordings.id });
  return Boolean(row);
}

/** One place that writes the recording row, so `updated_at` never drifts. */
async function note(
  recordingId: string,
  fields: Partial<{
    state: LessonRecording["state"];
    failureReason: string | null;
    durationSeconds: number | null;
    providerExpiresAt: Date | null;
    ingestedAt: Date;
  }>,
): Promise<void> {
  await db
    .update(lessonRecordings)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(lessonRecordings.id, recordingId));
}

async function loadTracks(recordingId: string): Promise<TrackForMatching[]> {
  const rows = await db
    .select()
    .from(lessonRecordingTracks)
    .where(eq(lessonRecordingTracks.recordingId, recordingId));
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    providerParticipantId: row.providerParticipantId,
    providerFileName: row.providerFileName,
    storageKey: row.storageKey,
  }));
}

function unchanged(recording: LessonRecording, reason: string): IngestOutcome {
  return {
    recordingId: recording.id,
    state: recording.state,
    copied: 0,
    alreadyStored: 0,
    unattributable: [],
    reason,
  };
}
