import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, lessons, students, teachers } from "@/db";
import { callPath } from "@/lib/call-path";
import { allowedTeacherEmails, requireAllowedTeacher } from "@/lib/mcp-auth";

/**
 * WHAT AN AGENT CAN DO TO A CLASSROOM.
 *
 * Deliberately the teacher's own roster operations and nothing else:
 * see your students, add one, put a lesson on the calendar, and find the
 * room for it. That is the whole set needed to stand a lesson up from
 * outside a browser, which is what the door exists for.
 *
 * What is NOT here is as deliberate. No deleting, no billing, no
 * touching another teacher's rows, no writing lesson RECORDS — the
 * corrections, vocabulary and insights a teacher approves are the
 * product's trust spine, and a machine that can write them directly
 * would make "the teacher approved this" unprovable. An agent can create
 * the container for a lesson; only a person fills it.
 *
 * Every function takes the teacher's email and re-checks it against the
 * allowlist. That is not redundant with the transport's bearer check:
 * these are ordinary functions, and a future caller that forgets the
 * gate would otherwise get an unscoped one for free.
 */

export type ToolResult = Record<string, unknown>;

export async function listStudents(input: {
  teacherEmail: string;
}): Promise<ToolResult> {
  const teacher = await requireAllowedTeacher(input.teacherEmail);
  const rows = await db
    .select({
      id: students.id,
      name: students.name,
      email: students.email,
      targetLanguage: students.targetLanguage,
      status: students.status,
    })
    .from(students)
    .where(eq(students.teacherId, teacher.id))
    .orderBy(asc(students.name));
  return { teacher: teacher.email, students: rows };
}

/**
 * Add a student to this teacher's roster.
 *
 * The email is the load-bearing field even though it is optional in the
 * schema: it is how a learner later CLAIMS the row by signing in, and
 * how the call guard admits them to a lesson room. A student created
 * without one can be taught but can never join their own call.
 */
export async function createStudent(input: {
  teacherEmail: string;
  name: string;
  email?: string;
  targetLanguage?: string;
}): Promise<ToolResult> {
  const teacher = await requireAllowedTeacher(input.teacherEmail);
  const email = input.email?.trim().toLowerCase() || null;

  // Idempotent on email — re-running a setup script should not litter a
  // roster with duplicates of the same person.
  if (email) {
    const existing = await db.query.students.findFirst({
      where: and(eq(students.teacherId, teacher.id), eq(students.email, email)),
    });
    if (existing) {
      return { student: existing, created: false };
    }
  }

  const [student] = await db
    .insert(students)
    .values({
      teacherId: teacher.id,
      name: input.name,
      email,
      targetLanguage: input.targetLanguage ?? "English",
    })
    .returning();
  return { student, created: true };
}

/**
 * Put a lesson on the calendar, and hand back the room for it.
 *
 * A FUTURE `startsAt` schedules; the teacher workspace treats a past one
 * as a lesson that already happened and expects notes. The tool returns
 * the call URL because that is invariably the next thing the caller
 * wants, and deriving it elsewhere would mean two places knowing the
 * route.
 */
export async function scheduleLesson(input: {
  teacherEmail: string;
  studentEmail: string;
  startsAt?: string;
  durationMinutes?: number;
  title?: string;
}): Promise<ToolResult> {
  const teacher = await requireAllowedTeacher(input.teacherEmail);
  const student = await db.query.students.findFirst({
    where: and(
      eq(students.teacherId, teacher.id),
      eq(students.email, input.studentEmail.trim().toLowerCase()),
    ),
  });
  if (!student) {
    throw new Error(
      `no student with email ${input.studentEmail} on ${teacher.email}'s roster — create_student first`,
    );
  }

  const startedAt = input.startsAt
    ? new Date(input.startsAt)
    : new Date(Date.now() + 10 * 60_000);
  if (Number.isNaN(startedAt.getTime())) {
    throw new Error(`startsAt is not a date: ${input.startsAt}`);
  }

  const [lesson] = await db
    .insert(lessons)
    .values({
      teacherId: teacher.id,
      studentId: student.id,
      title: input.title ?? null,
      startedAt,
      durationMinutes: input.durationMinutes ?? 60,
      status: "scheduled",
      sourceType: "manual",
    })
    .returning();

  return {
    lesson,
    callPath: callPath(lesson.id),
    teacher: teacher.email,
    student: student.email,
  };
}

export async function listLessons(input: {
  teacherEmail: string;
  limit?: number;
}): Promise<ToolResult> {
  const teacher = await requireAllowedTeacher(input.teacherEmail);
  const rows = await db
    .select({
      id: lessons.id,
      title: lessons.title,
      startedAt: lessons.startedAt,
      status: lessons.status,
      studentName: students.name,
      studentEmail: students.email,
    })
    .from(lessons)
    .innerJoin(students, eq(students.id, lessons.studentId))
    .where(eq(lessons.teacherId, teacher.id))
    .orderBy(desc(lessons.startedAt))
    .limit(Math.min(input.limit ?? 20, 100));
  return {
    teacher: teacher.email,
    lessons: rows.map((row) => ({ ...row, callPath: callPath(row.id) })),
  };
}

/** Which teachers this deployment will let the token act as, and whether
 * each has actually signed in yet. A first call that answers "what can I
 * even do here" saves a round of guessing. */
export async function whoAmI(): Promise<ToolResult> {
  const allowed = allowedTeacherEmails();
  const rows = await db
    .select({ email: teachers.email, name: teachers.name })
    .from(teachers);
  const known = new Set(rows.map((r) => r.email.toLowerCase()));
  return {
    allowedTeacherEmails: allowed.map((email) => ({
      email,
      hasSignedIn: known.has(email),
    })),
  };
}
