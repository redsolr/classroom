import { and, eq } from "drizzle-orm";
import { db, lessons, students } from "@/db";

/** Throws unless the student belongs to the teacher. */
export async function assertStudentOwned(
  teacherId: string,
  studentId: string,
): Promise<void> {
  const row = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.teacherId, teacherId)),
    columns: { id: true },
  });
  if (!row) {
    throw new Error("Student not found");
  }
}

/** Throws unless the lesson belongs to the teacher; returns its studentId. */
export async function assertLessonOwned(
  teacherId: string,
  lessonId: string,
): Promise<{ studentId: string }> {
  const row = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacherId)),
    columns: { id: true, studentId: true },
  });
  if (!row) {
    throw new Error("Lesson not found");
  }
  return { studentId: row.studentId };
}
