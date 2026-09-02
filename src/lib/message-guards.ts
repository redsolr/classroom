import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import {
  db,
  messageThreads,
  students,
  teachers,
  type MessageThread,
  type Student,
  type Teacher,
} from "@/db";

/**
 * WHO MAY READ AND WRITE A THREAD.
 *
 * Exactly the two people the relationship is between: the teacher whose
 * roster the student is on, and the person that roster row belongs to.
 *
 * The matching rule is lifted from `call-guards.ts` deliberately — same
 * two people, same claim mechanism, and two different answers to "is
 * this your student" is how one of them eventually becomes wrong. The
 * teacher is matched on WorkOS user id (emails change, and a tutor who
 * updates theirs must not lose their own threads). The student is
 * matched on WorkOS user id FIRST and then on EMAIL, because email is
 * the product's own claim mechanism and load-bearing here: an account
 * that already has a teacher row always resolves as a teacher, so a
 * teacher who also sits in someone else's roster never gets a
 * `workos_user_id` written on that student row. That is the founder's
 * own account, which is a teacher, a learner and somebody's student.
 *
 * This lives outside `src/lib/actions/` for the same reason the call and
 * study guards do: everything exported from there becomes a public POST
 * endpoint.
 */

export type MessageRole = "teacher" | "student";

export type ThreadParticipant = {
  role: MessageRole;
  thread: MessageThread;
  teacher: Teacher;
  student: Student;
  /** The other person's name, as this side should see it. */
  otherName: string;
};

/** The signed-in identity every entry point already has to hand. */
export type Caller = {
  workosUserId: string;
  email: string;
};

/**
 * A student can be messaged when there is somebody to reach: an email is
 * how a login claims the row, so without one no account can ever arrive
 * to read what was sent. A hand-typed student with no address is a
 * normal state — the teacher sees why, not an error.
 */
export function studentIsReachable(student: {
  email: string | null;
  workosUserId: string | null;
}): boolean {
  return Boolean(student.workosUserId ?? student.email);
}

/**
 * The thread for this relationship, created if it does not exist.
 *
 * Safe to call concurrently: `student_id` is unique, so two people
 * opening the thread at the same moment produce one row and the loser
 * reads the winner's.
 */
export async function ensureThread(
  teacherId: string,
  studentId: string,
): Promise<MessageThread> {
  const existing = await db.query.messageThreads.findFirst({
    where: eq(messageThreads.studentId, studentId),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(messageThreads)
    .values({ teacherId, studentId })
    .onConflictDoNothing({ target: messageThreads.studentId })
    .returning();
  if (created) return created;

  const raced = await db.query.messageThreads.findFirst({
    where: eq(messageThreads.studentId, studentId),
  });
  if (!raced) throw new Error("Thread not found");
  return raced;
}

/** Both sides of a thread, or throw. Shared by every resolver below. */
async function partiesOf(
  thread: MessageThread,
): Promise<{ teacher: Teacher; student: Student }> {
  const [teacher, student] = await Promise.all([
    db.query.teachers.findFirst({ where: eq(teachers.id, thread.teacherId) }),
    db.query.students.findFirst({ where: eq(students.id, thread.studentId) }),
  ]);
  // Both are `on delete cascade` parents of the thread, so a missing one
  // means the row is mid-delete rather than that the caller found a hole.
  if (!teacher || !student) throw new Error("Thread not found");
  return { teacher, student };
}

function participantFor(
  caller: Caller,
  thread: MessageThread,
  teacher: Teacher,
  student: Student,
): ThreadParticipant | null {
  if (teacher.workosUserId === caller.workosUserId) {
    return {
      role: "teacher",
      thread,
      teacher,
      student,
      otherName: student.name,
    };
  }
  const emailsMatch =
    Boolean(student.email) &&
    student.email!.toLowerCase() === caller.email.toLowerCase();
  if (student.workosUserId === caller.workosUserId || emailsMatch) {
    return {
      role: "student",
      thread,
      teacher,
      student,
      otherName: teacher.name ?? teacher.email,
    };
  }
  return null;
}

/**
 * Resolve the caller's side of this thread, or throw.
 *
 * "No such thread" and "not yours" are the same message on purpose — a
 * distinct not-found lets anyone enumerate which threads exist.
 */
export async function requireThreadParticipant(
  caller: Caller,
  threadId: string,
): Promise<ThreadParticipant> {
  const thread = await db.query.messageThreads.findFirst({
    where: eq(messageThreads.id, threadId),
  });
  if (!thread) throw new Error("Thread not found");

  const { teacher, student } = await partiesOf(thread);
  const me = participantFor(caller, thread, teacher, student);
  if (!me) throw new Error("Thread not found");
  return me;
}

/**
 * The teacher's own thread with one of their students, opened on demand.
 *
 * Scoped to the caller's roster first, so a teacher id in the URL can
 * never reach someone else's student.
 */
export async function requireOwnStudentThread(
  teacher: Teacher,
  studentId: string,
): Promise<ThreadParticipant> {
  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.teacherId, teacher.id)),
  });
  if (!student) throw new Error("Student not found");
  // Refused BEFORE the thread exists, not after: a thread with someone
  // who has no account and no address to claim one with can only ever be
  // a monologue, and an empty one sitting in the inbox reads as a
  // conversation that failed rather than one that was never possible.
  if (!studentIsReachable(student)) {
    throw new Error(
      "This student has no email on file, so there is no account to reach.",
    );
  }

  const thread = await ensureThread(teacher.id, student.id);
  return {
    role: "teacher",
    thread,
    teacher,
    student,
    otherName: student.name,
  };
}

/**
 * Every roster row this caller is the STUDENT of.
 *
 * One person can be several people's student — the whole point of the
 * tutor pilot is that a learner can book more than one tutor — so this
 * is a list, not a lookup. Claimed rows and unclaimed-but-matching ones
 * both count: a learner who booked a tutor an hour ago has a roster row
 * their next login will claim, and making them wait for that to see the
 * booking's own confirmation would be an obvious lie about what the app
 * knows.
 */
export async function studentRowsFor(caller: Caller): Promise<Student[]> {
  return db.query.students.findMany({
    where: or(
      eq(students.workosUserId, caller.workosUserId),
      and(
        eq(students.email, caller.email),
        isNull(students.workosUserId),
      ),
    ),
  });
}
