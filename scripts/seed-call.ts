import { and, eq } from "drizzle-orm";
import { db, learners, lessonCalls, students, teachers, tutorBookings } from "../src/db";

/**
 * A confirmed booking you can walk straight into a call from.
 *
 * Exists because the only other way to get one is a paid Stripe
 * checkout, and "buy a lesson from yourself" is a poor way to test a
 * camera. It creates the booking the payment webhook would have written,
 * and nothing else — no payment row, because no money moved and a ledger
 * that says otherwise is worse than no ledger.
 *
 * The mock-auth identity is the TEACHER of this booking, and the learner
 * is a separate row. That is deliberate: `requireCallParticipant` checks
 * the learner branch first, so a booking where one person is both would
 * only ever exercise one of the two roles.
 *
 * LOCAL ONLY. Like `seed-tutors`, it refuses to run against a remote
 * database — it fabricates a CONFIRMED booking, and a confirmed booking
 * in production means somebody paid.
 */

const MOCK_WORKOS_USER = "mock_teacher_dev";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (url && !/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      `refusing to seed a confirmed booking against a remote database (${url.replace(/:[^:@]*@/, ":***@")})`,
    );
  }

  const [teacher] = await db
    .insert(teachers)
    .values({
      workosUserId: MOCK_WORKOS_USER,
      email: "teacher@class-room.dev",
      name: "Demo Teacher",
    })
    .onConflictDoUpdate({
      target: teachers.workosUserId,
      set: { email: "teacher@class-room.dev" },
    })
    .returning();

  const [learner] = await db
    .insert(learners)
    .values({
      workosUserId: "call_demo_learner",
      email: "learner@class-room.dev",
      name: "Demo Learner",
    })
    .onConflictDoUpdate({
      target: learners.workosUserId,
      set: { email: "learner@class-room.dev" },
    })
    .returning();

  const existingStudent = await db.query.students.findFirst({
    where: and(
      eq(students.teacherId, teacher.id),
      eq(students.email, "learner@class-room.dev"),
    ),
  });
  const student =
    existingStudent ??
    (
      await db
        .insert(students)
        .values({
          teacherId: teacher.id,
          name: "Demo Learner",
          targetLanguage: "French",
          email: "learner@class-room.dev",
        })
        .returning()
    )[0];

  // Reuse the same booking across runs so the URL you bookmarked keeps
  // working, and drop any room it already had so the next open starts clean.
  const existing = await db.query.tutorBookings.findFirst({
    where: and(
      eq(tutorBookings.teacherId, teacher.id),
      eq(tutorBookings.learnerId, learner.id),
    ),
  });

  const startsAt = new Date(Date.now() + 5 * 60_000);
  const booking =
    existing ??
    (
      await db
        .insert(tutorBookings)
        .values({
          teacherId: teacher.id,
          learnerId: learner.id,
          studentId: student.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 60 * 60_000),
          status: "confirmed",
          priceCents: 2500,
          focus: ["conversation"],
        })
        .returning()
    )[0];

  await db.delete(lessonCalls).where(eq(lessonCalls.bookingId, booking.id));

  console.log(`\n  Lesson room ready:\n\n    http://localhost:3020/call/${booking.id}\n`);
  console.log(`  teacher  ${teacher.email}  (the mock-auth identity)`);
  console.log(`  learner  ${learner.email}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
