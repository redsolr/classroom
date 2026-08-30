"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, tutorAvailability, tutorProfiles } from "@/db";
import { requireTeacher } from "@/lib/auth";
import {
  accountIsReady,
  connectConfigured,
  createConnectedAccount,
  fetchAccount,
  onboardingLink,
  payoutDashboardLink,
} from "@/lib/tutor-billing";

/**
 * THE TUTOR'S LISTING — who you are, when you teach, and getting paid.
 *
 * The other half of `tutors.ts` (booking). Separated because the two
 * audiences share no helper and must never share an auth resolver: every
 * export here calls `requireTeacher`, every export there calls
 * `requireLearner`, and keeping them in different files makes copying
 * the wrong one a visible mistake rather than an invisible one.
 */

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
