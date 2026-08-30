"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  db,
  lessonCalls,
  lessonRecordings,
  lessonRecordingTracks,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import {
  bothConsented,
  ensureCall,
  findCall,
  requireCallParticipant,
} from "@/lib/call-guards";
import {
  addParticipant,
  listActiveParticipants,
  realtimeKitConfigured,
  startTrackRecording,
  stopRecording,
} from "@/lib/realtimekit";

/**
 * THE LESSON CALL — joining it, consenting to it, recording it.
 *
 * Every export resolves its caller with `requireLearner()`, which is the
 * authenticator for BOTH audiences here (every signed-in account has a
 * learner row; a teacher is not redirected away from their own lesson).
 * `requireCallParticipant` then does the half the ratchet cannot: proving
 * this person is one of the two people this booking is between.
 *
 * The ordering rule the whole feature rests on: nothing starts recording
 * until both consents are stored. It is enforced here, on the server,
 * because a client that decides when recording may begin is a client that
 * can be made to lie about it.
 */

const bookingIdSchema = z.string().uuid();

export type JoinedCall = {
  authToken: string;
  meetingId: string;
  role: "teacher" | "learner";
  displayName: string;
  bothConsented: boolean;
  selfConsented: boolean;
  recording: boolean;
};

/**
 * Open (or rejoin) the room for a booking and mint this person's token.
 *
 * Rejoining is the normal case, not an edge case: a dropped connection
 * must land back in the SAME meeting. The room is therefore created once
 * per booking and looked up thereafter — `lesson_calls.booking_id` is
 * unique so two racing joins cannot produce two rooms.
 */
export async function joinLessonCall(rawBookingId: string): Promise<JoinedCall> {
  const learner = await requireLearner();
  const bookingId = bookingIdSchema.parse(rawBookingId);
  const me = await requireCallParticipant(learner, bookingId);

  if (!realtimeKitConfigured()) {
    throw new Error(
      "Live lessons are not configured on this environment — set REALTIMEKIT_APP_ID and REALTIMEKIT_API_KEY",
    );
  }

  // Usually already open — the page opens it on load, so that consent
  // (which comes BEFORE joining) has something to attach to.
  const call = await ensureCall(me.booking);
  if (!call) throw new Error("Could not open the lesson room");

  const { token } = await addParticipant({
    meetingId: call.providerMeetingId,
    name: me.displayName,
    customParticipantId: me.customParticipantId,
    role: me.role,
  });

  const live = await activeRecording(call.id);

  return {
    authToken: token,
    meetingId: call.providerMeetingId,
    role: me.role,
    displayName: me.displayName,
    bothConsented: bothConsented(call),
    selfConsented: Boolean(
      me.role === "teacher" ? call.teacherConsentAt : call.learnerConsentAt,
    ),
    recording: Boolean(live),
  };
}

/**
 * Record this person's consent to being transcribed.
 *
 * Stored per side with a timestamp rather than as one boolean, because
 * "both agreed, and when" is the thing we would have to be able to show.
 * Consent is not revocable mid-call in this release; stopping the
 * recording is, and that is the honest control to give.
 */
export async function consentToRecording(
  rawBookingId: string,
): Promise<{ bothConsented: boolean }> {
  const learner = await requireLearner();
  const bookingId = bookingIdSchema.parse(rawBookingId);
  const me = await requireCallParticipant(learner, bookingId);

  const call = await findCall(bookingId);
  if (!call) throw new Error("Lesson room is not open");

  const now = new Date();
  const [updated] = await db
    .update(lessonCalls)
    .set(
      me.role === "teacher"
        ? { teacherConsentAt: now, updatedAt: now }
        : { learnerConsentAt: now, updatedAt: now },
    )
    .where(eq(lessonCalls.id, call.id))
    .returning();

  revalidatePath(`/call/${bookingId}`);
  return { bothConsented: bothConsented(updated) };
}

/**
 * Begin recording each participant to their own audio file.
 *
 * Three refusals, all deliberate:
 *  - not both consented → we do not record people who have not agreed;
 *  - already recording → one call, one recording, or the artifact
 *    becomes ambiguous and the webhook has two rows to choose from;
 *  - fewer live participants than expected → the provider will happily
 *    accept an allowlist matching nobody and return UPLOADED with zero
 *    files, so an empty or short list is refused here rather than
 *    discovered when someone goes looking for the lesson.
 */
export async function startLessonRecording(
  rawBookingId: string,
): Promise<{ recordingId: string }> {
  const learner = await requireLearner();
  const bookingId = bookingIdSchema.parse(rawBookingId);
  const me = await requireCallParticipant(learner, bookingId);
  // The teacher runs the lesson and is accountable for the record of it.
  if (me.role !== "teacher") {
    throw new Error("Only the teacher can start recording");
  }

  const call = await findCall(bookingId);
  if (!call) throw new Error("Lesson room is not open");
  if (!bothConsented(call)) {
    throw new Error("Both people must consent before recording starts");
  }

  const existing = await activeRecording(call.id);
  if (existing) return { recordingId: existing.providerRecordingId };

  const participants = await listActiveParticipants(call.providerMeetingId);
  const ours = participants.filter((p) =>
    p.customParticipantId?.startsWith("teacher:") ||
    p.customParticipantId?.startsWith("learner:"),
  );
  if (ours.length < 2) {
    throw new Error(
      "Both people must be in the call before recording starts — recording a room with one participant would produce a lesson with no second voice",
    );
  }

  // user_ids are RealtimeKit's participant ids, NOT our
  // custom_participant_id. Passing ours records nothing, silently.
  const providerRecordingId = await startTrackRecording({
    meetingId: call.providerMeetingId,
    userIds: ours.map((p) => p.participantId),
    fileNamePrefix: "lesson",
  });

  const [row] = await db
    .insert(lessonRecordings)
    .values({
      callId: call.id,
      providerRecordingId,
      state: "recording",
      expectedTrackCount: ours.length,
      startedAt: new Date(),
    })
    .returning();

  // The mapping from a file to a person is decided HERE, while we can see
  // who is in the room, not later by parsing a file name.
  await db.insert(lessonRecordingTracks).values(
    ours.map((p) => ({
      recordingId: row.id,
      role: p.customParticipantId?.startsWith("teacher:")
        ? ("teacher" as const)
        : ("learner" as const),
      providerParticipantId: p.participantId,
      // Filled in from the provider's manifest on ingest; the placeholder
      // keeps the row unique per participant until then.
      providerFileName: `pending:${p.participantId}`,
    })),
  );

  revalidatePath(`/call/${bookingId}`);
  return { recordingId: providerRecordingId };
}

/** Stop the active recording. Ingestion is driven by the webhook. */
export async function stopLessonRecording(
  rawBookingId: string,
): Promise<{ stopped: boolean }> {
  const learner = await requireLearner();
  const bookingId = bookingIdSchema.parse(rawBookingId);
  const me = await requireCallParticipant(learner, bookingId);
  if (me.role !== "teacher") {
    throw new Error("Only the teacher can stop recording");
  }

  const call = await findCall(bookingId);
  if (!call) throw new Error("Lesson room is not open");

  const active = await activeRecording(call.id);
  if (!active) return { stopped: false };

  await stopRecording(active.providerRecordingId);
  await db
    .update(lessonRecordings)
    .set({ state: "recording_complete", stoppedAt: new Date(), updatedAt: new Date() })
    .where(eq(lessonRecordings.id, active.id));

  revalidatePath(`/call/${bookingId}`);
  return { stopped: true };
}

/** Mark the room closed. The provider ends its own session on idle. */
export async function endLessonCall(rawBookingId: string): Promise<void> {
  const learner = await requireLearner();
  const bookingId = bookingIdSchema.parse(rawBookingId);
  await requireCallParticipant(learner, bookingId);

  const call = await findCall(bookingId);
  if (!call || call.endedAt) return;

  await db
    .update(lessonCalls)
    .set({ endedAt: new Date(), updatedAt: new Date() })
    .where(eq(lessonCalls.id, call.id));
  revalidatePath(`/call/${bookingId}`);
}

// ---------------------------------------------------------------------------
// Local helpers — not exported, so they are not endpoints.
// ---------------------------------------------------------------------------

/** The recording still running for this call, if any. */
async function activeRecording(callId: string) {
  const row = await db.query.lessonRecordings.findFirst({
    where: and(
      eq(lessonRecordings.callId, callId),
      eq(lessonRecordings.state, "recording"),
      isNull(lessonRecordings.stoppedAt),
    ),
  });
  return row ?? null;
}
