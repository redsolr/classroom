import "server-only";
import { eq } from "drizzle-orm";
import {
  db,
  lessonCalls,
  lessons,
  students,
  teachers,
  type Lesson,
  type LessonCall,
  type Student,
  type Teacher,
} from "@/db";
import {
  createMeeting,
  realtimeKitConfigured,
  type CallRole,
} from "@/lib/realtimekit";

/**
 * WHO MAY ENTER A LESSON ROOM.
 *
 * Exactly two people: the teacher whose lesson it is, and the student it
 * is with. Not "any signed-in user with the link" — a lesson room is
 * where a recorded, transcribed conversation happens, and a third party
 * in it is a privacy incident rather than an inconvenience.
 *
 * The room hangs off a LESSON rather than a paid booking. A confirmed
 * tutor booking writes a `lessons` row, so the pilot still reaches its
 * room; and a teacher who scheduled a student themselves — the thing the
 * teacher workspace has done since day one — reaches one too, without a
 * payment rail that no environment currently has configured.
 *
 * This lives outside `src/lib/actions/` for the same reason the study
 * guards do: everything exported from there becomes a public POST
 * endpoint.
 */

export type CallParticipant = {
  role: CallRole;
  lesson: Lesson;
  teacher: Teacher;
  student: Student;
  /** The name the other person sees in the call. */
  displayName: string;
  /** Stable per-person id handed to the provider, so track files come
   * back attributable to a role without trusting the provider's order. */
  customParticipantId: string;
};

/**
 * Resolve the caller's part in this lesson, or throw.
 *
 * The teacher is matched on WorkOS user id — emails change, and a tutor
 * who updates theirs must not lose their own room.
 *
 * The student is matched on WorkOS user id FIRST, then on email. Email
 * is not a fallback bolted on here; it is the product's own claim
 * mechanism (`resolveStudentAccount` links a login to a student row the
 * first time the addresses match). It matters more than it looks: an
 * account that already has a TEACHER row always resolves as a teacher,
 * so a teacher sitting in someone else's roster never gets a
 * `workos_user_id` written on that student row, and would be locked out
 * of a lesson that is plainly theirs. That is exactly the founder's own
 * account.
 */
export async function requireCallParticipant(
  caller: { workosUserId: string; email: string; name: string | null },
  lessonId: string,
): Promise<CallParticipant> {
  const lesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
  });
  // Same message for "no such lesson" and "not yours" — a distinct
  // not-found would let anyone enumerate which lesson ids exist.
  if (!lesson) throw new Error("Lesson not found");

  const [teacher, student] = await Promise.all([
    db.query.teachers.findFirst({ where: eq(teachers.id, lesson.teacherId) }),
    db.query.students.findFirst({ where: eq(students.id, lesson.studentId) }),
  ]);
  if (!teacher || !student) throw new Error("Lesson not found");

  if (teacher.workosUserId === caller.workosUserId) {
    return {
      role: "teacher",
      lesson,
      teacher,
      student,
      displayName: teacher.name ?? teacher.email,
      customParticipantId: `teacher:${teacher.id}`,
    };
  }

  const emailsMatch =
    Boolean(student.email) &&
    student.email!.toLowerCase() === caller.email.toLowerCase();
  if (student.workosUserId === caller.workosUserId || emailsMatch) {
    return {
      role: "student",
      lesson,
      teacher,
      student,
      displayName: student.name,
      customParticipantId: `student:${student.id}`,
    };
  }

  throw new Error("Lesson not found");
}

/** The room for this lesson, if one has been opened yet. */
export async function findCall(lessonId: string): Promise<LessonCall | null> {
  const row = await db.query.lessonCalls.findFirst({
    where: eq(lessonCalls.lessonId, lessonId),
  });
  return row ?? null;
}

/**
 * The room for this lesson, created if it does not exist yet.
 *
 * Opened when someone OPENS the lesson, not when they join it, because
 * consent comes before joining — that is the whole point of the order —
 * and consent has to be recorded against something. Making the room on
 * join meant the consent button on the pre-call screen could only ever
 * fail.
 *
 * Safe to call from a page render: `lesson_id` is unique, so two people
 * arriving at once produce one room and the loser reads the winner's.
 * The provider meeting created by the loser is simply never used.
 */
export async function ensureCall(
  participant: CallParticipant,
): Promise<LessonCall | null> {
  const existing = await findCall(participant.lesson.id);
  if (existing) return existing;
  if (!realtimeKitConfigured()) return null;

  const providerMeetingId = await createMeeting(`lesson-${participant.lesson.id}`);
  const [created] = await db
    .insert(lessonCalls)
    .values({
      lessonId: participant.lesson.id,
      teacherId: participant.teacher.id,
      studentId: participant.student.id,
      providerMeetingId,
    })
    .onConflictDoNothing({ target: lessonCalls.lessonId })
    .returning();
  return created ?? (await findCall(participant.lesson.id));
}

/** Both people have said yes, in the record, with times. */
export function bothConsented(call: LessonCall): boolean {
  return Boolean(call.teacherConsentAt && call.studentConsentAt);
}

/** This person's own consent timestamp, whichever side they are. */
export function selfConsentAt(
  call: LessonCall,
  role: CallRole,
): Date | null {
  return role === "teacher" ? call.teacherConsentAt : call.studentConsentAt;
}

