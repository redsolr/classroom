"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  db,
  lessonCalls,
  lessonRecordings,
  lessonRecordingTracks,
  type LessonCall,
  type Message,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { callPath } from "@/lib/call-path";
import {
  bothConsented,
  ensureCall,
  findCall,
  requireCallParticipant,
  selfConsentAt,
  type CallParticipant,
} from "@/lib/call-guards";
import { roleFromParticipantId } from "@/lib/call-participants";
import { ensureThread, studentIsReachable } from "@/lib/message-guards";
import { latestMessages } from "@/lib/message-queries";
import { postMessage } from "@/lib/messages";
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
 * authenticator for BOTH audiences here: every signed-in account has a
 * learner row, so it establishes WHO is calling without redirecting a
 * teacher away from their own lesson the way `requireTeacher()` would.
 * It carries the WorkOS id and email, and `requireCallParticipant` then
 * does the half the ratchet cannot — proving this person is one of the
 * two the lesson is between.
 *
 * The ordering rule the whole feature rests on: nothing starts recording
 * until both consents are stored. It is enforced here, on the server,
 * because a client that decides when recording may begin is a client that
 * can be made to lie about it.
 */

const lessonIdSchema = z.string().uuid();

/** The same bounds `/messages` puts on a message, for the same reasons. */
const chatBodySchema = z.string().trim().min(1).max(4000);

/**
 * A message as the call pane needs it.
 *
 * Deliberately NOT the `messages` row: the pane builds these from the
 * live broadcast too, where there is no row to copy — and a shape that
 * can only be made by reading the database is a shape the wire cannot
 * speak. `createdAt` is an ISO string for the same reason.
 */
export type CallChatMessage = {
  id: string;
  author: "teacher" | "student" | "system";
  body: string;
  createdAt: string;
};

function toCallChatMessage(row: Message): CallChatMessage {
  return {
    id: row.id,
    author: row.author,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The part of every action's preamble that is genuinely the same:
 * validate the id, prove the caller belongs to this lesson, and find the
 * room. Returns both, because every caller needs both.
 *
 * `requireLearner()` is deliberately NOT folded in here. The auth
 * ratchet reads the AST of each exported action and looks for a direct
 * call to a resolver; hiding it behind a helper would satisfy the
 * function's need and defeat the check that keeps every action honest.
 * The repetition is the point.
 */
async function openLesson(
  caller: { workosUserId: string; email: string; name: string | null },
  rawLessonId: string,
): Promise<{ me: CallParticipant; call: LessonCall | null }> {
  const lessonId = lessonIdSchema.parse(rawLessonId);
  const me = await requireCallParticipant(caller, lessonId);
  return { me, call: await findCall(lessonId) };
}

/** Every surface that shows this call, in one place. */
function revalidateCall(lessonId: string): void {
  revalidatePath(callPath(lessonId));
}

/**
 * The thread these two share, opened if this is the first thing said.
 *
 * A student nobody can reach gets no thread — the same rule
 * `postThreadEventForStudent` applies, for the same reason: a hand-typed
 * roster row with no email can never have an account, so a thread for it
 * is a conversation with one reader sitting in the teacher's inbox. Here
 * it can only happen to a teacher alone in a room, and the refusal is
 * written to be read by the person who sees it.
 */
async function callThread(me: CallParticipant) {
  if (!studentIsReachable(me.student)) {
    throw new Error(
      "There is nobody to message yet — this student has no email on their record, so they have no account to read it.",
    );
  }
  return ensureThread(me.teacher.id, me.student.id);
}

/** The room, or a refusal a person can read. */
function requireRoom(call: LessonCall | null): LessonCall {
  if (!call) throw new Error("Lesson room is not open");
  return call;
}

export type JoinedCall = {
  authToken: string;
  meetingId: string;
  role: "teacher" | "student";
  displayName: string;
  bothConsented: boolean;
  selfConsented: boolean;
  recording: boolean;
};

/**
 * Open (or rejoin) the room for a lesson and mint this person's token.
 *
 * Rejoining is the normal case, not an edge case: a dropped connection
 * must land back in the SAME meeting. The room is therefore created once
 * per lesson and looked up thereafter — `lesson_calls.lesson_id` is
 * unique so two racing joins cannot produce two rooms.
 */
export async function joinLessonCall(rawLessonId: string): Promise<JoinedCall> {
  const caller = await requireLearner();
  const { me } = await openLesson(caller, rawLessonId);

  if (!realtimeKitConfigured()) {
    throw new Error(
      "Live lessons are not configured on this environment — set REALTIMEKIT_APP_ID and REALTIMEKIT_API_KEY",
    );
  }

  // Usually already open — the page opens it on load, so that consent
  // (which comes BEFORE joining) has something to attach to.
  const call = await ensureCall(me);
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
    selfConsented: Boolean(selfConsentAt(call, me.role)),
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
  rawLessonId: string,
): Promise<{ bothConsented: boolean }> {
  const caller = await requireLearner();
  const { me, call } = await openLesson(caller, rawLessonId);
  const room = requireRoom(call);

  const now = new Date();
  const [updated] = await db
    .update(lessonCalls)
    .set(
      me.role === "teacher"
        ? { teacherConsentAt: now, updatedAt: now }
        : { studentConsentAt: now, updatedAt: now },
    )
    .where(eq(lessonCalls.id, room.id))
    .returning();

  revalidateCall(me.lesson.id);
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
  rawLessonId: string,
): Promise<{ recordingId: string }> {
  const caller = await requireLearner();
  const { me, call } = await openLesson(caller, rawLessonId);
  // The teacher runs the lesson and is accountable for the record of it.
  if (me.role !== "teacher") {
    throw new Error("Only the teacher can start recording");
  }

  const room = requireRoom(call);
  if (!bothConsented(room)) {
    throw new Error("Both people must consent before recording starts");
  }

  const existing = await activeRecording(room.id);
  if (existing) return { recordingId: existing.providerRecordingId };

  const participants = await listActiveParticipants(room.providerMeetingId);
  const mine = participants.filter((p) =>
    roleFromParticipantId(p.customParticipantId),
  );

  // ONE PERSON, ONE TRACK. Every join mints a fresh participant token, so
  // someone with the lesson open in two tabs — or who dropped and came
  // back — is several provider participants wearing one identity. Left
  // alone that records the same voice twice under different ids, and
  // `expectedTrackCount` becomes a count of TABS rather than of people,
  // which quietly destroys the one check that proves a lesson was
  // captured. Keyed on our own id, keeping the most recent join.
  const byPerson = new Map<string, (typeof mine)[number]>();
  for (const p of mine) {
    if (p.customParticipantId) byPerson.set(p.customParticipantId, p);
  }
  const ours = [...byPerson.values()];
  if (ours.length < 2) {
    throw new Error(
      "Both people must be in the call before recording starts — recording a room with one participant would produce a lesson with no second voice",
    );
  }

  // user_ids are RealtimeKit's participant ids, NOT our
  // custom_participant_id. Passing ours records nothing, silently.
  const providerRecordingId = await startTrackRecording({
    meetingId: room.providerMeetingId,
    userIds: ours.map((p) => p.participantId),
    fileNamePrefix: "lesson",
  });

  const [row] = await db
    .insert(lessonRecordings)
    .values({
      callId: room.id,
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
      role: roleFromParticipantId(p.customParticipantId) ?? "student",
      providerParticipantId: p.participantId,
      // Filled in from the provider's manifest on ingest; the placeholder
      // keeps the row unique per participant until then.
      providerFileName: `pending:${p.participantId}`,
    })),
  );

  revalidateCall(me.lesson.id);
  return { recordingId: providerRecordingId };
}

/** Stop the active recording. Ingestion is driven by the webhook. */
export async function stopLessonRecording(
  rawLessonId: string,
): Promise<{ stopped: boolean }> {
  const caller = await requireLearner();
  const { me, call } = await openLesson(caller, rawLessonId);
  if (me.role !== "teacher") {
    throw new Error("Only the teacher can stop recording");
  }

  const active = await activeRecording(requireRoom(call).id);
  if (!active) return { stopped: false };

  await stopRecording(active.providerRecordingId);
  await db
    .update(lessonRecordings)
    .set({ state: "recording_complete", stoppedAt: new Date(), updatedAt: new Date() })
    .where(eq(lessonRecordings.id, active.id));

  revalidateCall(me.lesson.id);
  return { stopped: true };
}

/**
 * What the two of them typed, most recent last.
 *
 * The SAME thread `/messages` shows — not a second, in-call-only chat.
 * The pane opens on what was already said, so a lesson starts from the
 * homework question asked on Tuesday rather than from an empty box, and
 * anything typed during the hour is still there afterwards.
 */
export async function callChatHistory(
  rawLessonId: string,
): Promise<CallChatMessage[]> {
  const caller = await requireLearner();
  const { me } = await openLesson(caller, rawLessonId);

  const thread = await callThread(me);
  // Newest-first from the query, reversed for reading order. Capped
  // because this is a side panel during a lesson, not the archive.
  const rows = await latestMessages(thread.id, 50);
  return rows.reverse().map(toCallChatMessage);
}

/**
 * Say something without interrupting the lesson.
 *
 * The database write is the record and comes FIRST; the live broadcast
 * to the other side is the caller's job afterwards, over the meeting
 * they are both already in. That order is deliberate — a line the other
 * person saw but that was never stored is a line neither of them can
 * find tomorrow, which is worse than one that arrives a moment late.
 *
 * The author is taken from the server's own view of who is calling, so
 * neither participant can post as the other.
 */
export async function sendCallChatMessage(
  rawLessonId: string,
  rawBody: string,
): Promise<CallChatMessage> {
  const caller = await requireLearner();
  const { me } = await openLesson(caller, rawLessonId);
  const body = chatBodySchema.parse(rawBody);

  const thread = await callThread(me);
  const message = await postMessage(thread.id, {
    author: me.role,
    body,
    // Stamped, so the thread can later say this was said DURING the
    // lesson rather than in the days around it.
    lessonId: me.lesson.id,
    // They are in the room with you.
    silent: true,
  });

  return toCallChatMessage(message);
}

/** Mark the room closed. The provider ends its own session on idle. */
export async function endLessonCall(rawLessonId: string): Promise<void> {
  const caller = await requireLearner();
  const { me, call } = await openLesson(caller, rawLessonId);
  if (!call || call.endedAt) return;

  await db
    .update(lessonCalls)
    .set({ endedAt: new Date(), updatedAt: new Date() })
    .where(eq(lessonCalls.id, call.id));
  revalidateCall(me.lesson.id);
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
