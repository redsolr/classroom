"use server";

import { and, eq } from "drizzle-orm";
import { format } from "date-fns";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  db,
  learners,
  lessons,
  students,
  tutorBookings,
  type Learner,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { billingConfigured, getStripe } from "@/lib/billing";
import {
  connectConfigured,
  createLessonCheckout,
  createRecurringCheckout,
} from "@/lib/tutor-billing";
import { LESSON_FOCUS_OPTIONS } from "@/lib/tutor-focus";
import { postThreadEventForStudent } from "@/lib/messages";
import {
  PLATFORM_FEE_PERCENT,
  RECURRING_DISCOUNT_PERCENT,
  recurringMonthlyPrice,
  splitLesson,
} from "@/lib/tutor-pricing";
import { loadTutor } from "@/lib/tutor-queries";
import { isOfferedSlot, weeklyPatternFrom } from "@/lib/tutor-slots";

/**
 * BOOKING A LESSON — the learner's half of the transaction.
 *
 * Split from the tutor's half (`tutor-listing.ts`) after the arc landed:
 * one file held two audiences, two auth resolvers and two entirely
 * different risk profiles. A file where `requireLearner` and
 * `requireTeacher` sit thirty lines apart is one where the wrong guard
 * eventually gets copied into the wrong function, and the money side is
 * the last place to leave that possibility open.
 *
 * Every export resolves its own caller — `npm run check:actions` enforces
 * that half — and every query is then narrowed to that caller's own rows,
 * which it cannot.
 */

// ---------------------------------------------------------------------------
// Learner side — booking a lesson.
// ---------------------------------------------------------------------------

const bookingSchema = z.object({
  profileId: z.string().uuid(),
  startsAt: z.coerce.date(),
  plan: z.enum(["single", "recurring"]),
  focus: z.array(z.enum(LESSON_FOCUS_OPTIONS)).max(7),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * The learner's roster row in THIS tutor's workspace.
 *
 * The first booking creates it, and that is the entire bridge between
 * the two halves of the app: from here on the tutor's existing loop —
 * agenda, prep sheet, lesson records, homework, the student portal —
 * works on this person with no special-casing, because they are just
 * another student. Nothing downstream needed to learn what a "learner"
 * is.
 *
 * Matched on email first so a tutor who already had this person on their
 * roster (they met on Preply, they were a friend) keeps ONE record with
 * the whole history in it, rather than acquiring a duplicate the day
 * they start booking through us.
 */
async function rosterRowFor(
  teacherId: string,
  learner: Learner,
  targetLanguage: string,
): Promise<string> {
  const existing = await db.query.students.findFirst({
    where: and(
      eq(students.teacherId, teacherId),
      eq(students.email, learner.email),
    ),
    columns: { id: true },
  });
  if (existing) return existing.id;

  const [created] = await db
    .insert(students)
    .values({
      teacherId,
      name: learner.name ?? learner.email.split("@")[0],
      email: learner.email,
      // Linking the WorkOS id here is what makes the student portal work
      // for them immediately, with no invitation step.
      workosUserId: learner.workosUserId,
      targetLanguage,
      status: "active",
      platform: "Classroom",
    })
    .returning({ id: students.id });
  return created.id;
}

/**
 * Hold a slot and send the learner to Stripe.
 *
 * The booking row is written BEFORE payment, as `pending_payment` with a
 * hold, and no lesson is created for it. That ordering is deliberate in
 * both directions: without the row, two learners could pay for the same
 * hour; with a lesson row, an abandoned checkout would put a lesson on a
 * tutor's agenda that nobody paid for and nobody is coming to.
 *
 * The slot is re-derived here and checked. The instant the client posted
 * is a request, not a fact — without this check anyone could book a
 * tutor's 3am, or an hour someone else took while the page sat open.
 */
export async function bookTutorLesson(formData: FormData): Promise<void> {
  const learner = await requireLearner();

  const parsed = bookingSchema.parse({
    profileId: formData.get("profileId"),
    startsAt: formData.get("startsAt"),
    plan: formData.get("plan") ?? "single",
    focus: formData.getAll("focus"),
    notes: formData.get("notes") || undefined,
  });

  if (!billingConfigured() || !connectConfigured()) {
    throw new Error(
      "Booking is unavailable: Stripe is not configured for this deployment.",
    );
  }

  const tutor = await loadTutor(parsed.profileId);
  // `loadTutor` already returns null for an unlisted tutor or one whose
  // payouts Stripe has not enabled — so this single check also covers
  // "someone kept a booking page open after the tutor paused".
  if (!tutor) throw new Error("This tutor isn't taking bookings right now.");
  if (!tutor.profile.stripeAccountId) {
    throw new Error("This tutor hasn't finished setting up payouts.");
  }

  const slot = isOfferedSlot(tutor.slots, parsed.startsAt);
  if (!slot) {
    throw new Error(
      "That time isn't available any more — pick another slot.",
    );
  }

  const stripe = getStripe();
  let customerId = learner.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: learner.email,
      name: learner.name ?? undefined,
      metadata: { learnerId: learner.id },
    });
    customerId = customer.id;
    await db
      .update(learners)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(learners.id, learner.id));
  }

  const studentId = await rosterRowFor(
    tutor.teacherId,
    learner,
    tutor.languages[0] ?? "English",
  );

  // ── Recurring: a standing weekly slot, billed monthly. ──────────
  if (parsed.plan === "recurring") {
    const monthly = recurringMonthlyPrice(tutor.rateCents, 4);
    const url = await createRecurringCheckout({
      customerId,
      destinationAccountId: tutor.profile.stripeAccountId,
      monthlyCents: monthly,
      feePercent: PLATFORM_FEE_PERCENT,
      currency: tutor.currency,
      productName: `Weekly lessons with ${tutor.name}`,
      description: `${tutor.lessonMinutes} minutes a week · ${RECURRING_DISCOUNT_PERCENT}% off the one-off rate`,
      teacherId: tutor.teacherId,
      learnerId: learner.id,
      // The pattern comes from the slot they actually picked, so the
      // standing hour is the one they chose rather than one they now
      // have to describe a second time. Read in the TUTOR's zone: the
      // server's local clock would put the pattern an hour or a day out
      // for anyone booking from another continent.
      ...weeklyPatternFrom(slot.startsAt, tutor.profile.timezone ?? "UTC"),
      lessonsPerMonth: 4,
      discountPercent: RECURRING_DISCOUNT_PERCENT,
      successPath: "/tutors/bookings?booked=1",
      cancelPath: `/tutors/${tutor.id}`,
    });
    redirect(url);
  }

  // ── Single lesson. ──────────────────────────────────────────────
  const split = splitLesson(tutor.rateCents);

  const [booking] = await db
    .insert(tutorBookings)
    .values({
      teacherId: tutor.teacherId,
      learnerId: learner.id,
      studentId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      plan: "single",
      status: "pending_payment",
      focus: parsed.focus,
      notes: parsed.notes ?? null,
      // The price is stamped NOW. A tutor raising their rate must never
      // silently reprice an hour someone is already paying for.
      priceCents: split.grossCents,
      currency: tutor.currency,
      holdExpiresAt: new Date(Date.now() + 20 * 60_000),
    })
    .returning({ id: tutorBookings.id });

  const url = await createLessonCheckout({
    customerId,
    destinationAccountId: tutor.profile.stripeAccountId,
    grossCents: split.grossCents,
    platformFeeCents: split.platformFeeCents,
    currency: tutor.currency,
    productName: `${tutor.lessonMinutes}-minute lesson with ${tutor.name}`,
    description: slot.startsAt.toISOString(),
    bookingId: booking.id,
    successPath: "/tutors/bookings?booked=1",
    cancelPath: `/tutors/${tutor.id}`,
  });
  redirect(url);
}

/**
 * Cancel an upcoming lesson.
 *
 * Deliberately does NOT refund. A no-questions instant refund on a
 * lesson starting in an hour makes a tutor's calendar worthless, and
 * a pilot with a handful of tutors does not need an automated refund
 * policy — it needs the cancellation recorded and a human deciding. So
 * the booking is cancelled, the tutor's agenda is freed, and the payment
 * row stays exactly as it was, which is the honest record of what
 * happened.
 */
export async function cancelTutorBooking(bookingId: string): Promise<void> {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(bookingId);

  const booking = await db.query.tutorBookings.findFirst({
    where: and(
      eq(tutorBookings.id, id),
      eq(tutorBookings.learnerId, learner.id),
    ),
  });
  if (!booking) throw new Error("Booking not found");

  await db.transaction(async (tx) => {
    await tx
      .update(tutorBookings)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(tutorBookings.id, booking.id));
    if (booking.lessonId) {
      await tx
        .update(lessons)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(lessons.id, booking.lessonId));
    }
  });

  // The tutor loses an hour they had committed. Finding that out by
  // noticing a gap on the agenda is how a cancellation becomes a
  // grievance; finding it out in the thread is how it becomes a
  // conversation about when to reschedule.
  await postThreadEventForStudent(booking.teacherId, booking.studentId, {
    author: "system",
    body: `The lesson on ${format(booking.startsAt, "EEE, MMM d 'at' HH:mm")} was cancelled.`,
    event: "booking_cancelled",
    bookingId: booking.id,
    notify: "teacher",
  });

  revalidatePath("/tutors/bookings");
}
