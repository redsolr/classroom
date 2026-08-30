"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  db,
  learners,
  lessons,
  students,
  tutorAvailability,
  tutorBookings,
  tutorProfiles,
  type Learner,
} from "@/db";
import { requireLearner, requireTeacher } from "@/lib/auth";
import { billingConfigured, getStripe } from "@/lib/billing";
import {
  accountIsReady,
  connectConfigured,
  createConnectedAccount,
  createLessonCheckout,
  createRecurringCheckout,
  fetchAccount,
  onboardingLink,
  payoutDashboardLink,
} from "@/lib/tutor-billing";
import {
  PLATFORM_FEE_PERCENT,
  RECURRING_DISCOUNT_PERCENT,
  recurringMonthlyPrice,
  splitLesson,
} from "@/lib/tutor-pricing";
import { LESSON_FOCUS_OPTIONS } from "@/lib/tutor-focus";
import { loadTutor } from "@/lib/tutor-queries";
import { isOfferedSlot, weeklyPatternFrom } from "@/lib/tutor-slots";

/**
 * TUTOR BOOKING AND PAYOUTS.
 *
 * Two audiences in one file because they are two ends of one
 * transaction, and splitting them would put the money's two halves in
 * places that could drift. Every export resolves its own caller —
 * `requireLearner` for the booking side, `requireTeacher` for the
 * listing side — which `npm run check:actions` enforces, and every query
 * is then narrowed to that caller's own rows, which it cannot.
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

  revalidatePath("/tutors/bookings");
}

// ---------------------------------------------------------------------------
// Teacher side — the listing, the hours, and getting paid.
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  headline: z.string().trim().min(4).max(120),
  bio: z.string().trim().max(2000).optional(),
  languages: z.array(z.string().trim().min(2).max(40)).min(1),
  country: z.string().trim().length(2).toUpperCase(),
  timezone: z.string().trim().min(3).max(60),
  // Money arrives as a decimal because that is what a human types.
  rate: z.coerce.number().positive().max(10_000),
  currency: z.string().trim().length(3).toLowerCase(),
  lessonMinutes: z.coerce.number().int().min(15).max(180),
});

export async function saveTutorProfile(formData: FormData): Promise<void> {
  const teacher = await requireTeacher();
  const parsed = profileSchema.parse({
    headline: formData.get("headline"),
    bio: formData.get("bio") || undefined,
    languages: formData.getAll("languages"),
    country: formData.get("country"),
    timezone: formData.get("timezone"),
    rate: formData.get("rate"),
    currency: formData.get("currency"),
    lessonMinutes: formData.get("lessonMinutes"),
  });

  const values = {
    headline: parsed.headline,
    bio: parsed.bio ?? null,
    languages: parsed.languages,
    country: parsed.country,
    timezone: parsed.timezone,
    rateCents: Math.round(parsed.rate * 100),
    currency: parsed.currency,
    lessonMinutes: parsed.lessonMinutes,
    updatedAt: new Date(),
  };

  await db
    .insert(tutorProfiles)
    .values({ teacherId: teacher.id, ...values })
    .onConflictDoUpdate({ target: tutorProfiles.teacherId, set: values });

  revalidatePath("/teaching/payouts");
  revalidatePath("/tutors");
}

const availabilitySchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export async function addTutorAvailability(formData: FormData): Promise<void> {
  const teacher = await requireTeacher();
  const parsed = availabilitySchema.parse({
    weekday: formData.get("weekday"),
    start: formData.get("start"),
    end: formData.get("end"),
  });

  const startMinute = toMinutes(parsed.start);
  const endMinute = toMinutes(parsed.end);
  if (endMinute <= startMinute) {
    throw new Error("The end of a window has to be after its start.");
  }

  await db.insert(tutorAvailability).values({
    teacherId: teacher.id,
    weekday: parsed.weekday,
    startMinute,
    endMinute,
  });

  revalidatePath("/teaching/payouts");
}

export async function removeTutorAvailability(id: string): Promise<void> {
  const teacher = await requireTeacher();
  const windowId = z.string().uuid().parse(id);
  // Teacher id in the predicate: deleting someone else's hours is
  // indistinguishable from deleting hours that never existed.
  await db
    .delete(tutorAvailability)
    .where(
      and(
        eq(tutorAvailability.id, windowId),
        eq(tutorAvailability.teacherId, teacher.id),
      ),
    );
  revalidatePath("/teaching/payouts");
}

/**
 * Publish or withdraw the listing.
 *
 * Refuses to publish without payouts. This is the check that stops the
 * worst failure the feature has: a learner paying real money for a
 * lesson whose money has nowhere to go. It is not advisory and there is
 * no override — a tutor who wants to be listed finishes Stripe first.
 */
export async function setTutorListed(listed: boolean): Promise<void> {
  const teacher = await requireTeacher();
  const profile = await db.query.tutorProfiles.findFirst({
    where: eq(tutorProfiles.teacherId, teacher.id),
  });
  if (!profile) throw new Error("Save your tutor profile first.");

  if (listed) {
    if (!profile.payoutsEnabled) {
      throw new Error(
        "Finish the Stripe payout setup before listing — a learner must never be able to pay for a lesson we can't pay you for.",
      );
    }
    if (!profile.timezone) {
      throw new Error("Set your timezone before listing — your hours depend on it.");
    }
    const hours = await db
      .select({ id: tutorAvailability.id })
      .from(tutorAvailability)
      .where(eq(tutorAvailability.teacherId, teacher.id))
      .limit(1);
    if (hours.length === 0) {
      throw new Error("Add at least one weekly window before listing.");
    }
  }

  await db
    .update(tutorProfiles)
    .set({ status: listed ? "listed" : "paused", updatedAt: new Date() })
    .where(eq(tutorProfiles.teacherId, teacher.id));

  revalidatePath("/teaching/payouts");
  revalidatePath("/tutors");
}

/**
 * Start (or resume) Stripe Express onboarding.
 *
 * The account is created on first call and its id stored; every later
 * call mints a FRESH link, because onboarding links expire in minutes
 * and a stored one is a support ticket waiting to happen.
 */
export async function startPayoutOnboarding(): Promise<void> {
  const teacher = await requireTeacher();
  if (!connectConfigured()) {
    throw new Error(
      "Payouts are unavailable: Stripe is not configured for this deployment.",
    );
  }

  const profile = await db.query.tutorProfiles.findFirst({
    where: eq(tutorProfiles.teacherId, teacher.id),
  });
  if (!profile) throw new Error("Save your tutor profile first.");

  let accountId = profile.stripeAccountId;
  if (!accountId) {
    accountId = await createConnectedAccount({
      email: teacher.email,
      country: profile.country ?? undefined,
    });
    await db
      .update(tutorProfiles)
      .set({ stripeAccountId: accountId, updatedAt: new Date() })
      .where(eq(tutorProfiles.teacherId, teacher.id));
  }

  redirect(await onboardingLink(accountId));
}

/**
 * Re-read Stripe's verdict on this account.
 *
 * The `account.updated` webhook is the normal path; this is the button
 * for when a tutor finishes onboarding and comes straight back before
 * the webhook lands, which is most of the time. It asks STRIPE rather
 * than assuming that returning from onboarding means it worked — coming
 * back from that flow proves only that they closed the tab.
 */
export async function refreshPayoutStatus(): Promise<void> {
  const teacher = await requireTeacher();
  const profile = await db.query.tutorProfiles.findFirst({
    where: eq(tutorProfiles.teacherId, teacher.id),
  });
  if (!profile?.stripeAccountId) return;

  const account = await fetchAccount(profile.stripeAccountId);
  const ready = accountIsReady(account);

  await db
    .update(tutorProfiles)
    .set({
      payoutsEnabled: ready,
      // Losing payouts un-lists you. Stripe disables accounts for real
      // reasons (expired documents, a failed check), and staying listed
      // through that would sell lessons we cannot pay for.
      status: ready ? profile.status : "paused",
      updatedAt: new Date(),
    })
    .where(eq(tutorProfiles.teacherId, teacher.id));

  revalidatePath("/teaching/payouts");
  revalidatePath("/tutors");
}

export async function openPayoutDashboard(): Promise<void> {
  const teacher = await requireTeacher();
  const profile = await db.query.tutorProfiles.findFirst({
    where: eq(tutorProfiles.teacherId, teacher.id),
  });
  if (!profile?.stripeAccountId) {
    throw new Error("Set up payouts first.");
  }
  redirect(await payoutDashboardLink(profile.stripeAccountId));
}
