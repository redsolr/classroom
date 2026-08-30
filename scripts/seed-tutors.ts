/**
 * Seed the tutor pilot with a few listed teachers, so the directory,
 * the slot grid and the booking modal are exercisable locally and in
 * e2e without anyone having to complete a real Stripe onboarding.
 *
 *   npm run db:seed:tutors
 *
 * DEV AND TEST ONLY, and it refuses to run against anything that looks
 * like production. `payoutsEnabled` is the one flag standing between a
 * listing and a learner being charged for a lesson, and the whole point
 * of that flag is that only Stripe sets it. A seed that can flip it in
 * production would turn the guard into a suggestion.
 */
import { eq } from "drizzle-orm";
import {
  db,
  teachers,
  tutorAvailability,
  tutorProfiles,
} from "../src/db";

const SEED_TUTORS = [
  {
    email: "yuki@classroom.dev",
    name: "Yuki Tanaka",
    headline: "Conversational Japanese for people who freeze up",
    bio: "I taught in a Tokyo language school for six years and then online for four. Most of my students can read far better than they can speak, and we fix that by talking — badly at first, on purpose.",
    languages: ["Japanese"],
    country: "JP",
    timezone: "Asia/Tokyo",
    rateCents: 3200,
    currency: "usd",
    lessonMinutes: 50,
    hours: [
      { weekday: 1, start: 9 * 60, end: 12 * 60 },
      { weekday: 3, start: 9 * 60, end: 12 * 60 },
      { weekday: 5, start: 18 * 60, end: 21 * 60 },
    ],
  },
  {
    email: "camille@classroom.dev",
    name: "Camille Roussel",
    headline: "French from absolute zero, patiently",
    bio: "Beginners only. I don't do grammar drills for their own sake — every lesson ends with you having said something real out loud.",
    languages: ["French"],
    country: "FR",
    timezone: "Europe/Paris",
    rateCents: 2800,
    currency: "eur",
    lessonMinutes: 50,
    hours: [
      { weekday: 2, start: 10 * 60, end: 14 * 60 },
      { weekday: 4, start: 10 * 60, end: 14 * 60 },
    ],
  },
  {
    email: "somchai@classroom.dev",
    name: "Somchai Prasert",
    headline: "Thai and English, business-focused",
    bio: "I work mostly with people who have moved to Bangkok for a job and need to function in both languages by Monday.",
    languages: ["Thai", "English"],
    country: "TH",
    timezone: "Asia/Bangkok",
    rateCents: 90000,
    currency: "thb",
    lessonMinutes: 60,
    hours: [
      { weekday: 1, start: 19 * 60, end: 21 * 60 },
      { weekday: 6, start: 9 * 60, end: 13 * 60 },
    ],
  },
];

function refuseInProduction(): void {
  const url = process.env.DATABASE_URL ?? "";
  const looksRemote = /neon\.tech|amazonaws|supabase|railway/.test(url);
  if (process.env.NODE_ENV === "production" || looksRemote) {
    throw new Error(
      "seed-tutors refuses to run against a remote or production database. " +
        "It sets payoutsEnabled, which only Stripe is allowed to set for real money.",
    );
  }
}

async function main() {
  refuseInProduction();

  for (const seed of SEED_TUTORS) {
    let teacher = await db.query.teachers.findFirst({
      where: eq(teachers.email, seed.email),
    });
    if (!teacher) {
      [teacher] = await db
        .insert(teachers)
        .values({
          // A stable synthetic id: these accounts are never signed into,
          // they exist to be booked.
          workosUserId: `seed_tutor_${seed.email.split("@")[0]}`,
          email: seed.email,
          name: seed.name,
          timezone: seed.timezone,
          languagesTaught: seed.languages,
        })
        .returning();
    }

    const values = {
      headline: seed.headline,
      bio: seed.bio,
      languages: seed.languages,
      country: seed.country,
      timezone: seed.timezone,
      rateCents: seed.rateCents,
      currency: seed.currency,
      lessonMinutes: seed.lessonMinutes,
      status: "listed" as const,
      // Local only — see the header. Booking still needs real Stripe keys
      // to get past checkout, so this makes the DIRECTORY explorable
      // without pretending money works.
      payoutsEnabled: true,
      stripeAccountId: `acct_seed_${seed.email.split("@")[0]}`,
      updatedAt: new Date(),
    };

    await db
      .insert(tutorProfiles)
      .values({ teacherId: teacher.id, ...values })
      .onConflictDoUpdate({ target: tutorProfiles.teacherId, set: values });

    await db
      .delete(tutorAvailability)
      .where(eq(tutorAvailability.teacherId, teacher.id));
    await db.insert(tutorAvailability).values(
      seed.hours.map((h) => ({
        teacherId: teacher.id,
        weekday: h.weekday,
        startMinute: h.start,
        endMinute: h.end,
      })),
    );

    console.log(`✓ ${seed.name} — ${seed.hours.length} weekly windows`);
  }

  console.log(`Seeded ${SEED_TUTORS.length} pilot tutors.`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("seed-tutors failed", error);
  process.exit(1);
});
