"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  corrections,
  db,
  goals,
  homework,
  insights,
  lessons,
  vocabularyItems,
} from "@/db";
import { requireTeacher } from "@/lib/auth";
import { assertLessonOwned } from "@/lib/guards";
import { getStudent } from "@/lib/queries";
import { extractLessonDraft, type StudentContext } from "@/lib/ai/extract";

/**
 * Process the lesson's raw input into a structured draft. The draft is
 * stored on the lesson (aiDraft) for teacher review — nothing is written
 * to the permanent student record until the teacher approves it.
 */
export type ProcessResult = { ok: true } | { ok: false; error: string };

export async function processLessonWithAI(
  lessonId: string,
  rawInput: string,
): Promise<ProcessResult> {
  const teacher = await requireTeacher();
  const { studentId } = await assertLessonOwned(teacher.id, lessonId);

  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, error: "Add some notes or a transcript before processing." };
  }

  const student = await getStudent(teacher.id, studentId);
  if (!student) return { ok: false, error: "Student not found." };

  // Persist the raw input first so nothing is lost if extraction fails.
  await db
    .update(lessons)
    .set({ rawInput: trimmed, updatedAt: new Date() })
    .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)));

  const [
    studentGoals,
    recentCorrections,
    recentVocabulary,
    openHomework,
    recentInsights,
  ] = await Promise.all([
    db
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.teacherId, teacher.id),
          eq(goals.studentId, studentId),
          eq(goals.status, "active"),
        ),
      ),
    db
      .select()
      .from(corrections)
      .where(
        and(
          eq(corrections.teacherId, teacher.id),
          eq(corrections.studentId, studentId),
        ),
      )
      .orderBy(desc(corrections.createdAt))
      .limit(10),
    db
      .select()
      .from(vocabularyItems)
      .where(
        and(
          eq(vocabularyItems.teacherId, teacher.id),
          eq(vocabularyItems.studentId, studentId),
        ),
      )
      .orderBy(desc(vocabularyItems.createdAt))
      .limit(15),
    db
      .select()
      .from(homework)
      .where(
        and(
          eq(homework.teacherId, teacher.id),
          eq(homework.studentId, studentId),
          inArray(homework.status, ["assigned", "submitted"]),
        ),
      ),
    db
      .select()
      .from(insights)
      .where(
        and(
          eq(insights.teacherId, teacher.id),
          eq(insights.studentId, studentId),
        ),
      )
      .orderBy(desc(insights.updatedAt))
      .limit(8),
  ]);

  const context: StudentContext = {
    student,
    goals: studentGoals,
    recentCorrections,
    recentVocabulary,
    openHomework,
    recentInsights,
  };

  let draft;
  try {
    draft = await extractLessonDraft(trimmed, context);
  } catch (err) {
    console.error("[ai] lesson extraction failed:", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Processing failed: ${err.message}`
          : "Processing failed. Please try again.",
    };
  }

  await db
    .update(lessons)
    .set({
      aiDraft: draft,
      aiProcessedAt: new Date(),
      status: "processed",
      updatedAt: new Date(),
    })
    .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)));

  revalidatePath(`/lessons/${lessonId}`);
  return { ok: true };
}
