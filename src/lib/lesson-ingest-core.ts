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
  type RecordingManifest,
  type TrackForMatching,
} from "@/lib/recording-manifest";
import { trackStartFromFileName } from "@/lib/transcript";

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
 *     webhook → fetch → copy. That is also what lets the sweep find a
 *     recording whose webhook never arrived at all.
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
 * runs them and bounded by the thing that actually ends them (the
 * provider's expiry) — a counter column would be a second, weaker answer
 * to what `updated_at` and `failure_reason` already say.
 *
 * THE I/O IS INJECTED. The provider and the bucket arrive as `IngestDeps`
 * rather than being imported, so the orchestration — the claim, the
 * lease, what happens when one of two files fails — runs against a real
 * database in `e2e/lesson-ingest.db.spec.ts` with a provider and a store
 * that do exactly what the test says. The production wiring is one call
 * in `lesson-ingest.ts`.
 */

export type IngestDeps = {
  provider: {
    fetchRecording: (providerRecordingId: string) => Promise<RecordingManifest>;
    downloadTrackFile: (
      downloadUrl: string,
    ) => Promise<{ body: Buffer; contentType: string }>;
  };
  storage: {
    putLessonAudio: (args: {
      key: string;
      body: Buffer;
      contentType: string;
    }) => Promise<{ key: string; bytes: number; sha256: string }>;
  };
  /** What the environment has. Missing pieces are a recorded state, not a crash. */
  configured: () => { provider: boolean; storage: boolean };
  /** Injectable so a test can put a recording's expiry in the past. */
  now?: () => Date;
};

/**
 * A recording another worker took this recently is left alone; one taken
 * longer ago than this was abandoned mid-copy and may be taken again.
 * The webhook and the sweep firing together is the case this is for.
 */
export const CLAIM_LEASE_MS = 15 * 60_000;

/** How long before the provider's copy dies we start saying so. */
export const EXPIRY_ALERT_MS = 48 * 60 * 60_000;

/**
 * A recording still marked `recording` this long after it started never
 * got a stop or a webhook — a closed laptop, a lost delivery. The
 * provider ends its own session on idle, so asking is how we find out.
 */
export const STALE_RECORDING_MS = 2 * 60 * 60_000;

export type IngestOutcome = {
  recordingId: string;
  state: LessonRecording["state"];
  copied: number;
  alreadyStored: number;
  /** Files the provider produced that belong to nobody we know. */
  unattributable: string[];
  reason?: string;
};

export type ReconcileReport = {
  considered: number;
  ingested: number;
  stillWaiting: number;
  failed: number;
  /** Recordings whose provider copy dies soon and are STILL not ours. */
  expiringSoon: { recordingId: string; expiresAt: string; state: string }[];
};

/**
 * Where a lesson's audio lives.
 *
 * Keyed on OUR ids, never the provider's: the lesson is the thing that
 * survives, and a bucket organised by a vendor's recording id becomes
 * unreadable the moment the vendor changes.
 */
export function lessonAudioKey(args: {
  lessonId: string;
  recordingId: string;
  fileName: string;
}): string {
  return `lessons/${args.lessonId}/${args.recordingId}/${args.fileName}`;
}

export function createIngest(deps: IngestDeps) {
  const now = deps.now ?? (() => new Date());

  /**
   * Copy one recording's track files into our bucket.
   *
   * Safe to call twice, from the webhook and the sweep at once: taking
   * the row into `ingesting` IS the lock, and a file already stored is
   * recognised and skipped rather than fetched again.
   */
  async function ingestRecording(recordingId: string): Promise<IngestOutcome> {
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
    const have = deps.configured();
    if (!have.provider || !have.storage) {
      const reason = !have.provider
        ? "RealtimeKit is not configured — cannot fetch the recording"
        : "lesson audio storage is not configured — set R2_BUCKET and its credentials";
      console.error(`[ingest] ${recording.id}: ${reason}`);
      await note(recording.id, { failureReason: reason });
      return unchanged(recording, reason);
    }

    // ASK FIRST, CLAIM SECOND. The fetch is cheap and idempotent, and
    // asking before taking the row means a recording that is still
    // running never flips to `ingesting` — which matters, because the
    // Stop button looks for `recording` and would find nothing during
    // that window.
    let manifest: RecordingManifest;
    try {
      manifest = await deps.provider.fetchRecording(recording.providerRecordingId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await note(recording.id, { failureReason: message });
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
      return failed(recording, "the provider reported the recording as ERRORED");
    }
    if (manifest.status !== "UPLOADED") {
      // Not finished yet. Nothing is wrong; the sweep will be back.
      return unchanged(
        recording,
        `provider status is ${manifest.status ?? "unknown"}`,
      );
    }

    const expiresAt = manifest.expiresAt ?? recording.providerExpiresAt;
    if (
      manifest.files.length === 0 &&
      expiresAt !== null &&
      expiresAt.getTime() < now().getTime()
    ) {
      // Nothing left to copy. This is the loss the whole pipeline exists
      // to prevent, so it is recorded as a failure rather than retried
      // forever — and said out loud.
      const reason = `the provider's copy expired on ${expiresAt.toISOString()} before we copied it`;
      console.error(`[ingest] ${recording.id}: ${reason}`);
      return failed(recording, reason);
    }

    if (!(await claim(recording))) {
      return unchanged(
        recording,
        "another worker is already ingesting this recording",
      );
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
        const { body, contentType } = await deps.provider.downloadTrackFile(
          item.file.downloadUrl,
        );
        const stored = await deps.storage.putLessonAudio({
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
              // When this file began, for the transcript's timeline.
              startedAt: trackStartFromFileName(item.file.fileName),
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
              startedAt: trackStartFromFileName(item.file.fileName),
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
        // Per file, so one bad link does not cost the other person's
        // audio. Whatever succeeded stays stored and is skipped next pass.
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
      await note(
        recording.id,
        { state: "ingested", ingestedAt: now(), failureReason: null },
        { holding: true },
      );
      return {
        recordingId: recording.id,
        state: "ingested",
        copied,
        alreadyStored,
        unattributable,
      };
    }

    // Left in `ingesting` deliberately: it is a state the sweep looks
    // for, and it says the truth — started, not finished. The lease is
    // released by letting it AGE: the row keeps this pass's timestamp and
    // becomes claimable again once that is older than the lease.
    await note(recording.id, { failureReason: missing }, { holding: true });
    return {
      recordingId: recording.id,
      state: "ingesting",
      copied,
      alreadyStored,
      unattributable,
      reason: missing,
    };
  }

  /**
   * The safety net: every recording that finished and is not ours yet.
   *
   * It exists because a webhook is a delivery, not a guarantee — one can
   * be lost, arrive while we are deploying, or never be sent at all
   * because a laptop closed and the session timed out on the provider's
   * side. Anything the live path missed has a week of sweeps to be
   * picked up, and anything running out of that window is named LOUDLY
   * rather than discovered as a gap afterwards.
   */
  async function reconcileRecordings(): Promise<ReconcileReport> {
    const at = now();
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
              new Date(at.getTime() - STALE_RECORDING_MS),
            ),
          ),
        ),
      );

    let ingested = 0;
    let failed = 0;
    let stillWaiting = 0;
    const stillNotOurs: LessonRecording[] = [];

    // Sequential on purpose: each pass downloads whole audio files into
    // memory, and a parallel sweep would multiply that by however many
    // lessons happened to finish at once.
    for (const row of candidates) {
      try {
        const outcome = await ingestRecording(row.id);
        if (outcome.state === "ingested") ingested += 1;
        else if (outcome.state === "failed") failed += 1;
        else {
          stillWaiting += 1;
          stillNotOurs.push(row);
        }
      } catch (error) {
        console.error(`[ingest] reconcile: ${row.id} threw`, error);
        failed += 1;
        stillNotOurs.push(row);
      }
    }

    // Only what this pass did NOT rescue. A recording copied a moment ago
    // is not "expiring soon", whatever its provider deadline says.
    const expiringSoon = stillNotOurs
      .filter(
        (row) =>
          row.providerExpiresAt !== null &&
          row.providerExpiresAt.getTime() - at.getTime() < EXPIRY_ALERT_MS,
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

  // -------------------------------------------------------------------------

  /**
   * Take the row, or discover someone else has it.
   *
   * Moving it into `ingesting` IS the lock — a conditional UPDATE, so two
   * workers cannot both win — and the lease is what stops a process that
   * died mid-copy from parking a lesson in `ingesting` forever.
   */
  async function claim(recording: LessonRecording): Promise<boolean> {
    const at = now();
    const [row] = await db
      .update(lessonRecordings)
      .set({ state: "ingesting", updatedAt: at })
      .where(
        and(
          eq(lessonRecordings.id, recording.id),
          or(
            inArray(lessonRecordings.state, ["recording", "recording_complete"]),
            and(
              eq(lessonRecordings.state, "ingesting"),
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

  /**
   * One place that writes the recording row.
   *
   * `updated_at` is the LEASE clock — "when did a worker last hold this
   * row" — so only writes made while holding it move it. Recording what
   * the provider said (its duration, its expiry) or why nothing happened
   * must NOT renew the lease: the first version of this did, and a worker
   * that died mid-copy could never be superseded, because every sweep's
   * pre-claim bookkeeping made the dead lease look fresh again.
   */
  async function note(
    recordingId: string,
    fields: Partial<{
      state: LessonRecording["state"];
      failureReason: string | null;
      durationSeconds: number | null;
      providerExpiresAt: Date | null;
      ingestedAt: Date;
    }>,
    opts: { holding?: boolean } = {},
  ): Promise<void> {
    await db
      .update(lessonRecordings)
      .set(opts.holding ? { ...fields, updatedAt: now() } : fields)
      .where(eq(lessonRecordings.id, recordingId));
  }

  async function failed(
    recording: LessonRecording,
    reason: string,
  ): Promise<IngestOutcome> {
    await note(
      recording.id,
      { state: "failed", failureReason: reason },
      { holding: true },
    );
    return { ...unchanged(recording, reason), state: "failed" };
  }

  return { ingestRecording, reconcileRecordings };
}

// ---------------------------------------------------------------------------

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
