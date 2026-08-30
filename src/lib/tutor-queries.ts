import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import {
  db,
  teachers,
  tutorAvailability,
  tutorBookings,
  tutorPayments,
  tutorProfiles,
  type TutorProfile,
} from "@/db";
import { BOOKING_HOLD_MINUTES, buildSlots, type Slot } from "@/lib/tutor-slots";

/**
 * Reading the tutor directory.
 *
 * One rule runs through all of it: a tutor is BOOKABLE only when they
 * are listed AND Stripe says their payouts work. Not "listed and they
 * told us their bank details" — Stripe's own answer, mirrored from the
 * `account.updated` webhook. Anything else means a learner can pay for
 * a lesson whose money has nowhere to land, which is the single worst
 * failure this feature can have: it takes real money from one person for
 * a promise we cannot keep to another.
 */

export type DirectoryTutor = {
  id: string;
  teacherId: string;
  name: string;
  headline: string;
  bio: string | null;
  languages: string[];
  country: string | null;
  timezone: string | null;
  rateCents: number;
  currency: string;
  lessonMinutes: number;
};

/** A held-but-unpaid booking still blocks its slot until the hold lapses. */
function blockingBookings(teacherId: string) {
  const holdCutoff = new Date(Date.now() - BOOKING_HOLD_MINUTES * 60_000);
  return db
    .select({
      startsAt: tutorBookings.startsAt,
      endsAt: tutorBookings.endsAt,
    })
    .from(tutorBookings)
    .where(
      and(
        eq(tutorBookings.teacherId, teacherId),
        or(
          eq(tutorBookings.status, "confirmed"),
          and(
            eq(tutorBookings.status, "pending_payment"),
            gte(tutorBookings.createdAt, holdCutoff),
          ),
        ),
      ),
    );
}

export async function listDirectoryTutors(
  language?: string,
): Promise<DirectoryTutor[]> {
  const rows = await db
    .select({
      id: tutorProfiles.id,
      teacherId: tutorProfiles.teacherId,
      name: teachers.name,
      email: teachers.email,
      headline: tutorProfiles.headline,
      bio: tutorProfiles.bio,
      languages: tutorProfiles.languages,
      country: tutorProfiles.country,
      timezone: tutorProfiles.timezone,
      rateCents: tutorProfiles.rateCents,
      currency: tutorProfiles.currency,
      lessonMinutes: tutorProfiles.lessonMinutes,
    })
    .from(tutorProfiles)
    .innerJoin(teachers, eq(teachers.id, tutorProfiles.teacherId))
    .where(
      and(
        eq(tutorProfiles.status, "listed"),
        eq(tutorProfiles.payoutsEnabled, true),
        language
          ? sql`${language} = any(${tutorProfiles.languages})`
          : undefined,
      ),
    )
    .orderBy(tutorProfiles.createdAt);

  return rows.map((row) => ({
    ...row,
    // A tutor who never filled in a name is still a person with a
    // booking page; the email's local part is a better placeholder than
    // an empty heading.
    name: row.name ?? row.email.split("@")[0],
  }));
}

export async function loadTutor(profileId: string): Promise<
  | (DirectoryTutor & {
      slots: Slot[];
      profile: TutorProfile;
    })
  | null
> {
  const [row] = await db
    .select({
      profile: tutorProfiles,
      name: teachers.name,
      email: teachers.email,
    })
    .from(tutorProfiles)
    .innerJoin(teachers, eq(teachers.id, tutorProfiles.teacherId))
    .where(eq(tutorProfiles.id, profileId))
    .limit(1);
  if (!row) return null;

  const { profile } = row;
  if (profile.status !== "listed" || !profile.payoutsEnabled) return null;

  const [availability, booked] = await Promise.all([
    db
      .select()
      .from(tutorAvailability)
      .where(eq(tutorAvailability.teacherId, profile.teacherId)),
    blockingBookings(profile.teacherId),
  ]);

  return {
    id: profile.id,
    teacherId: profile.teacherId,
    name: row.name ?? row.email.split("@")[0],
    headline: profile.headline,
    bio: profile.bio,
    languages: profile.languages,
    country: profile.country,
    timezone: profile.timezone,
    rateCents: profile.rateCents,
    currency: profile.currency,
    lessonMinutes: profile.lessonMinutes,
    profile,
    slots: buildSlots({
      availability,
      booked,
      lessonMinutes: profile.lessonMinutes,
      // A listed tutor always has a zone — `listTutorProfile` refuses to
      // publish without one, precisely so this is never a guess.
      timezone: profile.timezone ?? "UTC",
      now: new Date(),
    }),
  };
}

/**
 * What a learner asked for LAST time, so the booking form can arrive
 * already filled in.
 *
 * The second booking with someone you already study with should be one
 * tap. Re-typing "conversation practice, I want to work on past tense"
 * every fortnight is the kind of small friction that quietly ends a
 * habit — and we already know the answer, because they told us.
 */
export async function lastBookingPreferences(
  learnerId: string,
  teacherId: string,
): Promise<{ focus: string[]; notes: string | null } | null> {
  const [previous] = await db
    .select({ focus: tutorBookings.focus, notes: tutorBookings.notes })
    .from(tutorBookings)
    .where(
      and(
        eq(tutorBookings.learnerId, learnerId),
        eq(tutorBookings.teacherId, teacherId),
        // Only bookings that actually happened or are happening. What
        // someone typed into a checkout they abandoned is not a
        // preference.
        inArray(tutorBookings.status, ["confirmed", "completed"]),
      ),
    )
    .orderBy(desc(tutorBookings.startsAt))
    .limit(1);
  return previous ?? null;
}

/** The learner's own lessons — upcoming first, then what has happened. */
export async function learnerBookings(learnerId: string) {
  return db
    .select({
      booking: tutorBookings,
      tutorName: teachers.name,
      tutorEmail: teachers.email,
      profileId: tutorProfiles.id,
    })
    .from(tutorBookings)
    .innerJoin(teachers, eq(teachers.id, tutorBookings.teacherId))
    .leftJoin(tutorProfiles, eq(tutorProfiles.teacherId, tutorBookings.teacherId))
    .where(
      and(
        eq(tutorBookings.learnerId, learnerId),
        // A lapsed hold is noise on someone's lesson list.
        inArray(tutorBookings.status, ["confirmed", "completed", "cancelled"]),
      ),
    )
    .orderBy(desc(tutorBookings.startsAt));
}

/** Payment history — the same rows both sides read, scoped per party. */
export async function learnerPayments(learnerId: string) {
  return db
    .select({
      payment: tutorPayments,
      tutorName: teachers.name,
      tutorEmail: teachers.email,
      startsAt: tutorBookings.startsAt,
    })
    .from(tutorPayments)
    .innerJoin(teachers, eq(teachers.id, tutorPayments.teacherId))
    .leftJoin(tutorBookings, eq(tutorBookings.id, tutorPayments.bookingId))
    .where(eq(tutorPayments.learnerId, learnerId))
    .orderBy(desc(tutorPayments.createdAt));
}

export async function teacherPayments(teacherId: string) {
  return db
    .select({
      payment: tutorPayments,
      startsAt: tutorBookings.startsAt,
    })
    .from(tutorPayments)
    .leftJoin(tutorBookings, eq(tutorBookings.id, tutorPayments.bookingId))
    .where(eq(tutorPayments.teacherId, teacherId))
    .orderBy(desc(tutorPayments.createdAt));
}

/**
 * A tutor's earnings, summed from the ledger.
 *
 * `tutorNetCents` is stored per row and summed, never recomputed from
 * today's commission rate — a history that recalculates itself is a
 * history that lies about last month the first time pricing changes.
 * Only `succeeded` counts: pending is not money, and a refund's row is
 * kept for the record rather than netted into the total silently.
 */
export async function teacherEarnings(teacherId: string) {
  const [row] = await db
    .select({
      grossCents: sql<number>`coalesce(sum(${tutorPayments.grossCents}), 0)::int`,
      netCents: sql<number>`coalesce(sum(${tutorPayments.tutorNetCents}), 0)::int`,
      lessons: sql<number>`count(*)::int`,
    })
    .from(tutorPayments)
    .where(
      and(
        eq(tutorPayments.teacherId, teacherId),
        eq(tutorPayments.status, "succeeded"),
      ),
    );
  return row ?? { grossCents: 0, netCents: 0, lessons: 0 };
}
