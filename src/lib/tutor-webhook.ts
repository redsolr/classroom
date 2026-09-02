import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { format } from "date-fns";
import {
  db,
  lessons,
  students,
  tutorBookings,
  tutorPayments,
  tutorProfiles,
  tutorSubscriptions,
} from "@/db";
import { postThreadEventForStudent } from "@/lib/messages";
import { accountIsReady, actualStripeFee } from "@/lib/tutor-billing";
import { splitLesson } from "@/lib/tutor-pricing";
import { nextOccurrences } from "@/lib/tutor-slots";

/**
 * STRIPE → MARKETPLACE STATE. The single writer.
 *
 * A booking becomes real here and nowhere else. The learner's redirect
 * back from checkout is cosmetic — it proves they closed a tab, not that
 * money moved — so nothing downstream of a `success_url` is allowed to
 * confirm a booking, put a lesson on a tutor's agenda, or write a
 * payment row. Same rule Study Pro already follows, and it matters more
 * here: the failure it prevents is a lesson appearing on someone's
 * calendar that nobody paid for.
 *
 * Kept out of `route.ts` so the marketplace's money logic is one
 * readable unit rather than three cases in a growing switch.
 */

/** Ours, or Study Pro's? The tutor flows stamp `teacherId` into metadata
 * at creation; Study Pro subscriptions have none. Without this the
 * existing Study Pro handler would see a tutor subscription, match it to
 * the learner by customer id, and hand out Pro for buying a lesson. */
export function isTutorSubscription(sub: Stripe.Subscription): boolean {
  return Boolean(sub.metadata?.teacherId);
}

export function isTutorCheckout(session: Stripe.Checkout.Session): boolean {
  return Boolean(session.metadata?.bookingId ?? session.metadata?.teacherId);
}

/**
 * The tutor's agenda entry.
 *
 * A booking that has been paid for becomes an ordinary `lessons` row —
 * which is the whole point of the bridge. From here the tutor's existing
 * loop (agenda, prep sheet, records, homework, recap) works on it with
 * no knowledge that a learner or a payment was ever involved.
 */
async function createAgendaLesson(booking: {
  id: string;
  teacherId: string;
  studentId: string;
  startsAt: Date;
  endsAt: Date;
  focus: string[];
  notes: string | null;
}): Promise<string> {
  const [student] = await db
    .select({ name: students.name })
    .from(students)
    .where(eq(students.id, booking.studentId))
    .limit(1);

  const minutes = Math.round(
    (booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000,
  );

  const [lesson] = await db
    .insert(lessons)
    .values({
      teacherId: booking.teacherId,
      studentId: booking.studentId,
      title:
        booking.focus.length > 0
          ? `${booking.focus.join(", ")} · ${student?.name ?? "Lesson"}`
          : `Lesson · ${student?.name ?? ""}`.trim(),
      startedAt: booking.startsAt,
      durationMinutes: minutes,
      status: "scheduled",
      // What the learner asked for goes straight into the field the prep
      // sheet already reads, so the tutor opens the lesson and finds the
      // brief waiting rather than having to go looking for the booking.
      nextLessonFocus:
        [booking.focus.join(", "), booking.notes].filter(Boolean).join(" — ") ||
        null,
    })
    .returning({ id: lessons.id });
  return lesson.id;
}

/** One paid single lesson: confirm it, put it on the agenda, record it. */
async function confirmSingleBooking(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const bookingId = session.metadata?.bookingId;
  if (!bookingId) return;
  if (session.payment_status !== "paid") {
    console.warn(
      `stripe webhook: checkout ${session.id} completed unpaid (${session.payment_status}) — booking ${bookingId} stays held`,
    );
    return;
  }

  const booking = await db.query.tutorBookings.findFirst({
    where: eq(tutorBookings.id, bookingId),
  });
  if (!booking) {
    console.error(`stripe webhook: no booking ${bookingId} for ${session.id}`);
    return;
  }
  // Stripe retries, and it is allowed to: a second delivery of the same
  // event must not create a second lesson or a second ledger row.
  if (booking.status === "confirmed" || booking.lessonId) return;

  const lessonId = await createAgendaLesson(booking);
  const split = splitLesson(booking.priceCents);
  const intentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  await db.transaction(async (tx) => {
    await tx
      .update(tutorBookings)
      .set({
        status: "confirmed",
        lessonId,
        holdExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tutorBookings.id, booking.id));

    await tx
      .insert(tutorPayments)
      .values({
        teacherId: booking.teacherId,
        learnerId: booking.learnerId,
        bookingId: booking.id,
        stripePaymentIntentId: intentId,
        currency: booking.currency,
        grossCents: split.grossCents,
        platformFeeCents: split.platformFeeCents,
        tutorNetCents: split.tutorNetCents,
        // Stripe's own fee is not knowable yet — it lands on the balance
        // transaction. Left null rather than filled with the estimate, so
        // nothing downstream can mistake a guess for the number.
        stripeFeeCents: null,
        status: "succeeded",
        paidAt: new Date(),
      })
      // The unique index on the intent is what makes a retried event a
      // no-op rather than a duplicate row.
      .onConflictDoNothing();
  });

  // AFTER the transaction, never inside it: a notification is not part of
  // the money write, and a thread post that threw mid-commit would roll
  // back a booking somebody has already paid for.
  //
  // Addressed to the TEACHER. The learner just paid and is looking at
  // the confirmation; the tutor is the one who has to find out that an
  // hour of their week is now spoken for.
  await postThreadEventForStudent(booking.teacherId, booking.studentId, {
    author: "system",
    body: `Lesson booked for ${format(booking.startsAt, "EEE, MMM d 'at' HH:mm")}.`,
    event: "booking_confirmed",
    bookingId: booking.id,
    // Both ids are stamped: the booking for the record, and the lesson
    // because the call room hangs off it — the one artifact a system
    // message can link to that means the same thing to both people.
    lessonId,
    notify: "teacher",
  });
}

/**
 * A standing weekly slot was paid for: record the subscription and put
 * the next month of lessons on the agenda.
 *
 * Lessons are written AHEAD rather than the morning of, because a
 * standing slot that only appears on the day is not the thing the
 * learner bought — they bought a hour in both calendars.
 */
async function startRecurring(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata;
  if (!meta?.teacherId || !meta.learnerId || !session.subscription) return;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;

  const existing = await db.query.tutorSubscriptions.findFirst({
    where: eq(tutorSubscriptions.stripeSubscriptionId, subscriptionId),
  });
  if (existing) return;

  const [profile] = await db
    .select()
    .from(tutorProfiles)
    .where(eq(tutorProfiles.teacherId, meta.teacherId))
    .limit(1);
  if (!profile) {
    console.error(
      `stripe webhook: subscription ${subscriptionId} names teacher ${meta.teacherId} with no tutor profile`,
    );
    return;
  }

  const weekday = Number(meta.weekday);
  const startMinute = Number(meta.startMinute);
  const lessonsPerMonth = Number(meta.lessonsPerMonth ?? 4);

  const [created] = await db
    .insert(tutorSubscriptions)
    .values({
      teacherId: meta.teacherId,
      learnerId: meta.learnerId,
      stripeSubscriptionId: subscriptionId,
      status: "active",
      weekday,
      startMinute,
      lessonsPerMonth,
      discountPercent: Number(meta.discountPercent ?? 0),
    })
    .returning({ id: tutorSubscriptions.id });

  await scheduleRecurringLessons({
    subscriptionId: created.id,
    teacherId: meta.teacherId,
    learnerId: meta.learnerId,
    weekday,
    startMinute,
    lessonsPerMonth,
    timezone: profile.timezone ?? "UTC",
    lessonMinutes: profile.lessonMinutes,
    priceCents: profile.rateCents,
    currency: profile.currency,
  });
}

async function scheduleRecurringLessons(input: {
  subscriptionId: string;
  teacherId: string;
  learnerId: string;
  weekday: number;
  startMinute: number;
  lessonsPerMonth: number;
  timezone: string;
  lessonMinutes: number;
  priceCents: number;
  currency: string;
}): Promise<void> {
  /**
   * The roster row always exists by now: `bookTutorLesson` creates or
   * matches it before anyone is sent to checkout, precisely so this
   * handler never has to invent one from a webhook. If it is missing,
   * something upstream broke — log it and stop, rather than guessing at
   * which student a paid subscription belongs to.
   *
   * The most recent booking also carries the focus and notes the learner
   * gave when they subscribed, so the generated lessons arrive with the
   * same brief rather than blank.
   */
  const booking = await db.query.tutorBookings.findFirst({
    where: and(
      eq(tutorBookings.teacherId, input.teacherId),
      eq(tutorBookings.learnerId, input.learnerId),
    ),
    columns: { studentId: true, focus: true, notes: true },
    orderBy: (b, { desc: order }) => order(b.createdAt),
  });
  if (!booking) {
    console.error(
      `stripe webhook: recurring subscription ${input.subscriptionId} has no roster row to schedule against`,
    );
    return;
  }
  const student = { id: booking.studentId };

  const occurrences = nextOccurrences({
    weekday: input.weekday,
    startMinute: input.startMinute,
    timezone: input.timezone,
    count: input.lessonsPerMonth,
    from: new Date(),
  });

  for (const startsAt of occurrences) {
    const endsAt = new Date(startsAt.getTime() + input.lessonMinutes * 60_000);
    // A slot already booked (the learner took a one-off in the same hour
    // before subscribing) is skipped rather than double-booked.
    const clash = await db.query.tutorBookings.findFirst({
      where: and(
        eq(tutorBookings.teacherId, input.teacherId),
        eq(tutorBookings.startsAt, startsAt),
        eq(tutorBookings.status, "confirmed"),
      ),
      columns: { id: true },
    });
    if (clash) continue;

    const [row] = await db
      .insert(tutorBookings)
      .values({
        teacherId: input.teacherId,
        learnerId: input.learnerId,
        studentId: student.id,
        subscriptionId: input.subscriptionId,
        startsAt,
        endsAt,
        plan: "recurring",
        status: "confirmed",
        focus: booking?.focus ?? [],
        notes: booking?.notes ?? null,
        priceCents: input.priceCents,
        currency: input.currency,
      })
      .returning({
        id: tutorBookings.id,
        teacherId: tutorBookings.teacherId,
        studentId: tutorBookings.studentId,
        startsAt: tutorBookings.startsAt,
        endsAt: tutorBookings.endsAt,
        focus: tutorBookings.focus,
        notes: tutorBookings.notes,
      });

    const lessonId = await createAgendaLesson(row);
    await db
      .update(tutorBookings)
      .set({ lessonId, updatedAt: new Date() })
      .where(eq(tutorBookings.id, row.id));
  }
}

/**
 * A subscription invoice was paid — the first one and every renewal.
 *
 * The ledger row is written from HERE rather than from the checkout, so
 * month one and month seven go through identical code. A renewal also
 * schedules the next month's lessons, which is what makes a standing
 * slot standing.
 */
async function recordSubscriptionInvoice(
  invoice: Stripe.Invoice,
): Promise<void> {
  const subscriptionId =
    typeof invoice.parent?.subscription_details?.subscription === "string"
      ? invoice.parent.subscription_details.subscription
      : invoice.parent?.subscription_details?.subscription?.id;
  if (!subscriptionId) return;

  const sub = await db.query.tutorSubscriptions.findFirst({
    where: eq(tutorSubscriptions.stripeSubscriptionId, subscriptionId),
  });
  if (!sub) return; // A Study Pro invoice — not ours.

  const gross = invoice.amount_paid;
  const split = splitLesson(gross);

  await db
    .insert(tutorPayments)
    .values({
      teacherId: sub.teacherId,
      learnerId: sub.learnerId,
      subscriptionId: sub.id,
      stripePaymentIntentId: invoice.id ?? null,
      currency: invoice.currency,
      grossCents: gross,
      platformFeeCents: split.platformFeeCents,
      tutorNetCents: split.tutorNetCents,
      stripeFeeCents: null,
      status: "succeeded",
      paidAt: new Date(),
    })
    .onConflictDoNothing();

  const [profile] = await db
    .select()
    .from(tutorProfiles)
    .where(eq(tutorProfiles.teacherId, sub.teacherId))
    .limit(1);
  if (!profile) return;

  await scheduleRecurringLessons({
    subscriptionId: sub.id,
    teacherId: sub.teacherId,
    learnerId: sub.learnerId,
    weekday: sub.weekday,
    startMinute: sub.startMinute,
    lessonsPerMonth: sub.lessonsPerMonth,
    timezone: profile.timezone ?? "UTC",
    lessonMinutes: profile.lessonMinutes,
    priceCents: profile.rateCents,
    currency: profile.currency,
  });
}

/**
 * Fill in what Stripe actually took.
 *
 * Until this runs, the ledger's `stripeFeeCents` is null and every
 * surface that shows our own margin says "estimated" and means it. The
 * tutor's number never changes, because it never depended on this.
 */
async function attachActualFee(intentId: string): Promise<void> {
  const row = await db.query.tutorPayments.findFirst({
    where: eq(tutorPayments.stripePaymentIntentId, intentId),
    columns: { id: true, stripeFeeCents: true },
  });
  if (!row || row.stripeFeeCents !== null) return;

  const actual = await actualStripeFee(intentId);
  if (!actual) return;

  await db
    .update(tutorPayments)
    .set({
      stripeFeeCents: actual.feeCents,
      stripeChargeId: actual.chargeId,
      updatedAt: new Date(),
    })
    .where(eq(tutorPayments.id, row.id));
}

/** Stripe's verdict on a connected account, mirrored. Losing payouts
 * un-lists the tutor — staying listed would sell lessons whose money has
 * nowhere to land. */
async function applyAccountUpdate(account: Stripe.Account): Promise<void> {
  const ready = accountIsReady(account);
  const updated = await db
    .update(tutorProfiles)
    .set({
      payoutsEnabled: ready,
      ...(ready ? {} : { status: "paused" as const }),
      updatedAt: new Date(),
    })
    .where(eq(tutorProfiles.stripeAccountId, account.id))
    .returning({ id: tutorProfiles.id });

  if (updated.length === 0) {
    console.warn(
      `stripe webhook: account.updated for ${account.id}, which no tutor profile claims`,
    );
  }
}

/**
 * Handle a marketplace event. Returns false when the event is not ours,
 * so the caller can fall through to the Study Pro handlers.
 */
export async function handleTutorEvent(event: Stripe.Event): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (!isTutorCheckout(session)) return false;
      if (session.mode === "subscription") await startRecurring(session);
      else await confirmSingleBooking(session);
      return true;
    }
    case "invoice.paid": {
      await recordSubscriptionInvoice(event.data.object);
      // Not exclusively ours — `recordSubscriptionInvoice` returns
      // quietly for a Study Pro invoice, and Study Pro tracks state from
      // `customer.subscription.*` anyway.
      return false;
    }
    case "payment_intent.succeeded": {
      await attachActualFee(event.data.object.id);
      return true;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      if (!isTutorSubscription(sub)) return false;
      await db
        .update(tutorSubscriptions)
        .set({
          status:
            sub.status === "active" || sub.status === "trialing"
              ? "active"
              : sub.status === "past_due" || sub.status === "incomplete"
                ? "past_due"
                : "canceled",
          currentPeriodEnd: sub.items.data[0]?.current_period_end
            ? new Date(sub.items.data[0].current_period_end * 1000)
            : null,
          updatedAt: new Date(),
        })
        .where(eq(tutorSubscriptions.stripeSubscriptionId, sub.id));
      return true;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const intentId =
        typeof charge.payment_intent === "string"
          ? charge.payment_intent
          : charge.payment_intent?.id;
      if (!intentId) return false;
      // The row is MARKED refunded, never deleted and never netted out
      // of the totals silently: a refund is something that happened, and
      // a history that erases it is not a history.
      await db
        .update(tutorPayments)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(tutorPayments.stripePaymentIntentId, intentId));
      return true;
    }
    case "account.updated": {
      await applyAccountUpdate(event.data.object);
      return true;
    }
    default:
      return false;
  }
}
