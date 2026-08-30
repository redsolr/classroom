import "server-only";
import { and, eq } from "drizzle-orm";
import {
  db,
  learners,
  lessonCalls,
  teachers,
  tutorBookings,
  type Learner,
  type LessonCall,
  type TutorBooking,
} from "@/db";
import {
  createMeeting,
  realtimeKitConfigured,
  type CallRole,
} from "@/lib/realtimekit";

/**
 * WHO MAY ENTER A LESSON ROOM.
 *
 * Exactly two people: the tutor who is teaching it and the learner who
 * booked it. Not "any signed-in user with the link" — a lesson room is
 * where a recorded, transcribed conversation happens, and a third party
 * in it is a privacy incident rather than an inconvenience.
 *
 * This lives outside `src/lib/actions/` for the same reason the study
 * guards do: everything exported from there becomes a public POST
 * endpoint.
 *
 * On the two-audience problem — `requireLearner()` is the authenticator
 * for BOTH sides. It resolves any signed-in account to its learner row
 * (every login has one, by design), so it establishes WHO is calling
 * without redirecting a teacher away the way `requireTeacher()` would.
 * The role below is then AUTHORIZATION, decided by the booking, never by
 * anything the caller sends.
 */

export type CallParticipant = {
  role: CallRole;
  booking: TutorBooking;
  /** The name the other person sees in the call. */
  displayName: string;
  /** Stable per-person id we hand the provider, so track files come back
   * attributable to a role without trusting the provider's ordering. */
  customParticipantId: string;
};

/**
 * Resolve the caller's part in this booking, or throw.
 *
 * The learner is matched on the booking's own `learnerId`; the teacher is
 * matched by walking from the booking's `teacherId` to that teacher's
 * WorkOS user, and comparing it to the caller's. Matching on email would
 * have been shorter and wrong — emails change, and a teacher who updates
 * theirs must not lose the room.
 */
export async function requireCallParticipant(
  caller: Learner,
  bookingId: string,
): Promise<CallParticipant> {
  const booking = await db.query.tutorBookings.findFirst({
    where: eq(tutorBookings.id, bookingId),
  });
  // Same message for "no such booking" and "not yours" — a distinct
  // not-found would let anyone enumerate which booking ids exist.
  if (!booking) throw new Error("Lesson not found");

  if (booking.learnerId === caller.id) {
    return {
      role: "learner",
      booking,
      displayName: caller.name ?? caller.email,
      customParticipantId: `learner:${caller.id}`,
    };
  }

  const tutor = await db.query.teachers.findFirst({
    where: and(
      eq(teachers.id, booking.teacherId),
      eq(teachers.workosUserId, caller.workosUserId),
    ),
  });
  if (tutor) {
    return {
      role: "teacher",
      booking,
      displayName: tutor.name ?? tutor.email,
      customParticipantId: `teacher:${tutor.id}`,
    };
  }

  throw new Error("Lesson not found");
}

/** The room for this booking, if one has been opened yet. */
export async function findCall(bookingId: string): Promise<LessonCall | null> {
  const row = await db.query.lessonCalls.findFirst({
    where: eq(lessonCalls.bookingId, bookingId),
  });
  return row ?? null;
}

/**
 * The room for this booking, created if it does not exist yet.
 *
 * Opened when someone OPENS the lesson, not when they join it, because
 * consent comes before joining — that is the whole point of the order —
 * and consent has to be recorded against something. Making the room on
 * join meant the consent button on the pre-call screen could only ever
 * fail.
 *
 * Safe to call from a page render: `booking_id` is unique, so two people
 * arriving at once produce one room and the loser reads the winner's.
 * The provider meeting created by the loser is simply never used.
 */
export async function ensureCall(
  booking: TutorBooking,
): Promise<LessonCall | null> {
  const existing = await findCall(booking.id);
  if (existing) return existing;
  if (!realtimeKitConfigured()) return null;

  const providerMeetingId = await createMeeting(`lesson-${booking.id}`);
  const [created] = await db
    .insert(lessonCalls)
    .values({
      bookingId: booking.id,
      teacherId: booking.teacherId,
      learnerId: booking.learnerId,
      providerMeetingId,
    })
    .onConflictDoNothing({ target: lessonCalls.bookingId })
    .returning();
  return created ?? (await findCall(booking.id));
}

/** Both people have said yes, in the record, with times. */
export function bothConsented(call: LessonCall): boolean {
  return Boolean(call.teacherConsentAt && call.learnerConsentAt);
}

/** The learner row for a booking — used to name the other participant. */
export async function bookingLearner(booking: TutorBooking) {
  return db.query.learners.findFirst({
    where: eq(learners.id, booking.learnerId),
  });
}
