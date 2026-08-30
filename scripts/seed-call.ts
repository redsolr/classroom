import { and, eq } from "drizzle-orm";
import { db, lessonCalls, lessons, students, teachers } from "../src/db";

/**
 * A scheduled lesson you can walk straight into a call from.
 *
 * The call room hangs off a LESSON, so this seeds the thing the teacher
 * workspace has always been able to make — a student and a scheduled
 * lesson — rather than a paid booking. That matters: no environment has
 * Stripe configured, so a confirmed booking cannot exist anywhere, and a
 * seed that faked one would be pretending money moved.
 *
 * Pass emails to point it at real accounts:
 *
 *   npm run db:seed:call -- --teacher a@example.com --student b@example.com
 *
 * The teacher must have signed in at least once (that is what creates
 * the teacher row). The student does not need an account yet — the
 * student row is claimed by email on their first login, and the call
 * guard matches on email for exactly that reason.
 *
 * LOCAL ONLY, like `seed-tutors`: it writes rows that assert a lesson
 * was arranged, and inventing those in production would put a lesson on
 * someone's real calendar.
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (url && !/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      `refusing to seed a lesson against a remote database (${url.replace(/:[^:@]*@/, ":***@")})`,
    );
  }

  const teacherEmail = arg("teacher") ?? "teacher@class-room.dev";
  const studentEmail = arg("student") ?? "learner@class-room.dev";
  const studentName = arg("student-name") ?? studentEmail.split("@")[0];

  // The teacher must already exist: a teacher row is created by signing
  // in, and fabricating one here would make a WorkOS id up.
  const teacher = await db.query.teachers.findFirst({
    where: eq(teachers.email, teacherEmail),
  });
  if (!teacher) {
    throw new Error(
      `no teacher with email ${teacherEmail} — sign in as them once first, then re-run`,
    );
  }

  const existingStudent = await db.query.students.findFirst({
    where: and(
      eq(students.teacherId, teacher.id),
      eq(students.email, studentEmail),
    ),
  });
  const student =
    existingStudent ??
    (
      await db
        .insert(students)
        .values({
          teacherId: teacher.id,
          name: studentName,
          email: studentEmail,
          targetLanguage: "Japanese",
        })
        .returning()
    )[0];

  const startedAt = new Date(Date.now() + 5 * 60_000);
  const [lesson] = await db
    .insert(lessons)
    .values({
      teacherId: teacher.id,
      studentId: student.id,
      startedAt,
      durationMinutes: 60,
      status: "scheduled",
      sourceType: "manual",
    })
    .returning();

  // Drop any room a previous run left, so the next open starts clean.
  await db.delete(lessonCalls).where(eq(lessonCalls.lessonId, lesson.id));

  console.log(`\n  Lesson room ready:\n\n    /call/${lesson.id}\n`);
  console.log(`  teacher  ${teacher.email}`);
  console.log(`  student  ${student.email} (${student.name})\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
