"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, messageThreads, tutorBookings } from "@/db";
import { requireLearner, requireTeacher } from "@/lib/auth";
import { accountabilityFor, learnerForStudent } from "@/lib/accountability";
import {
  ensureThread,
  requireOwnStudentThread,
  requireThreadParticipant,
} from "@/lib/message-guards";
import { postMessage, revalidateThread } from "@/lib/messages";

/**
 * MESSAGES — sending, reading, and the nudge.
 *
 * Every export resolves its caller directly, which the auth ratchet
 * (`npm run check:actions`) reads the AST to prove. `requireLearner()`
 * is the authenticator for the two-sided actions for the same reason the
 * call actions use it: every signed-in account has a learner row, so it
 * establishes WHO is calling without redirecting a teacher away from
 * their own thread the way `requireTeacher()` would. The guard then does
 * the half the ratchet cannot — proving this person is one of the two
 * the thread is between.
 */

const threadIdSchema = z.string().uuid();

const bodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  /** Set by the nudge button; the words themselves are never sent from
   * the client — see `sendThreadMessage`. */
  attachStrugglingWords: z.string().optional(),
});

/**
 * Say something to the other person.
 *
 * The attached words are re-derived on the server from the review log,
 * never read out of the form. A client that can name the words it wants
 * stamped into a message is a client that can put words in a tutor's
 * mouth — and these particular words are the ones a learner is worst at,
 * which is not a thing anyone else gets to assert about them.
 */
export async function sendThreadMessage(
  rawThreadId: string,
  formData: FormData,
): Promise<void> {
  const caller = await requireLearner();
  const threadId = threadIdSchema.parse(rawThreadId);
  const parsed = bodySchema.parse(Object.fromEntries(formData));
  const me = await requireThreadParticipant(caller, threadId);

  let terms: { term: string; meaning: string | null }[] | undefined;
  if (parsed.attachStrugglingWords && me.role === "teacher") {
    const learnerId = await learnerForStudent(me.student.id, me.teacher.id);
    if (learnerId) {
      const window = await accountabilityFor(learnerId);
      terms = window.struggling.map((w) => ({
        term: w.term,
        meaning: w.meaning,
      }));
    }
  }

  await postMessage(threadId, {
    author: me.role,
    body: parsed.body,
    terms,
  });
}

/**
 * Mark this side of the thread read, as of now.
 *
 * Called when the thread is OPENED rather than on a scroll heuristic: a
 * read receipt that fires when a message merely passed under the
 * viewport is a claim we would have to stand behind and cannot.
 */
export async function markThreadRead(rawThreadId: string): Promise<void> {
  const caller = await requireLearner();
  const threadId = threadIdSchema.parse(rawThreadId);
  const me = await requireThreadParticipant(caller, threadId);

  const now = new Date();
  await db
    .update(messageThreads)
    .set({
      ...(me.role === "teacher" ? { teacherReadAt: now } : { studentReadAt: now }),
      updatedAt: now,
    })
    .where(eq(messageThreads.id, threadId));

  revalidateThread(threadId);
}

/**
 * Open the teacher's thread with one of their students, creating it on
 * first use, and go there.
 *
 * The guard refuses a student with no email and no claimed account —
 * an address is how a login claims the row, so there would be nobody on
 * the other end.
 */
/**
 * The learner's door: open the thread with the tutor behind one of THEIR
 * bookings, creating it on first use, and go there.
 *
 * The booking is looked up under the caller's own learner id first, so a
 * booking id in the form can never open someone else's thread. The
 * relationship it resolves to is the roster row the booking wrote —
 * the same row the teacher's door resolves from the other side.
 */
export async function openTutorThread(bookingId: string): Promise<void> {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(bookingId);
  const booking = await db.query.tutorBookings.findFirst({
    where: and(eq(tutorBookings.id, id), eq(tutorBookings.learnerId, learner.id)),
    columns: { teacherId: true, studentId: true },
  });
  if (!booking) throw new Error("Booking not found");

  const thread = await ensureThread(booking.teacherId, booking.studentId);
  redirect(`/messages/${thread.id}`);
}

export async function openStudentThread(
  studentId: string,
  /** Arrive with the accountability nudge already drafted in the
   * composer. A flag rather than the text itself: the draft is written
   * on the server from the review log, and a caller that could supply
   * the sentence could sign anything with the tutor's name. */
  nudge = false,
): Promise<void> {
  const teacher = await requireTeacher();
  const parsed = z.string().uuid().parse(studentId);
  const me = await requireOwnStudentThread(teacher, parsed);
  redirect(`/messages/${me.thread.id}${nudge ? "?nudge=1" : ""}`);
}
