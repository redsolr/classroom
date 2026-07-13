"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  corrections,
  db,
  homework,
  lessonTopics,
  vocabularyItems,
} from "@/db";
import { requireTeacher } from "@/lib/auth";
import { assertLessonOwned, assertStudentOwned } from "@/lib/guards";

function refresh(studentId: string, lessonId?: string | null) {
  revalidatePath(`/students/${studentId}`);
  if (lessonId) revalidatePath(`/lessons/${lessonId}`);
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

export async function addTopic(lessonId: string, formData: FormData) {
  const teacher = await requireTeacher();
  const { studentId } = await assertLessonOwned(teacher.id, lessonId);
  const title = z.string().trim().min(1).parse(formData.get("title"));

  await db.insert(lessonTopics).values({
    teacherId: teacher.id,
    lessonId,
    title,
    description: (formData.get("description") as string) || null,
  });
  refresh(studentId, lessonId);
}

export async function deleteTopic(topicId: string, lessonId: string) {
  const teacher = await requireTeacher();
  const { studentId } = await assertLessonOwned(teacher.id, lessonId);
  await db
    .delete(lessonTopics)
    .where(
      and(eq(lessonTopics.id, topicId), eq(lessonTopics.teacherId, teacher.id)),
    );
  refresh(studentId, lessonId);
}

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

const correctionSchema = z.object({
  category: z.enum([
    "grammar",
    "vocabulary",
    "pronunciation",
    "wordChoice",
    "naturalExpression",
    "spelling",
    "other",
  ]),
  originalText: z.string().trim().min(1),
  correctedText: z.string().trim().min(1),
  explanation: z.string().trim().optional(),
});

export async function addCorrection(
  studentId: string,
  lessonId: string | null,
  formData: FormData,
) {
  const teacher = await requireTeacher();
  await assertStudentOwned(teacher.id, studentId);
  if (lessonId) await assertLessonOwned(teacher.id, lessonId);
  const parsed = correctionSchema.parse(Object.fromEntries(formData));

  await db.insert(corrections).values({
    teacherId: teacher.id,
    studentId,
    lessonId,
    category: parsed.category,
    originalText: parsed.originalText,
    correctedText: parsed.correctedText,
    explanation: parsed.explanation || null,
    teacherApproved: true,
  });
  refresh(studentId, lessonId);
}

export async function deleteCorrection(
  correctionId: string,
  studentId: string,
  lessonId: string | null,
) {
  const teacher = await requireTeacher();
  await db
    .delete(corrections)
    .where(
      and(eq(corrections.id, correctionId), eq(corrections.teacherId, teacher.id)),
    );
  refresh(studentId, lessonId);
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const vocabularySchema = z.object({
  term: z.string().trim().min(1),
  meaning: z.string().trim().optional(),
  translation: z.string().trim().optional(),
  example: z.string().trim().optional(),
  language: z.string().trim().optional(),
});

export async function addVocabulary(
  studentId: string,
  lessonId: string | null,
  formData: FormData,
) {
  const teacher = await requireTeacher();
  await assertStudentOwned(teacher.id, studentId);
  if (lessonId) await assertLessonOwned(teacher.id, lessonId);
  const parsed = vocabularySchema.parse(Object.fromEntries(formData));

  await db.insert(vocabularyItems).values({
    teacherId: teacher.id,
    studentId,
    lessonId,
    term: parsed.term,
    meaning: parsed.meaning || null,
    translation: parsed.translation || null,
    example: parsed.example || null,
    language: parsed.language || null,
  });
  refresh(studentId, lessonId);
}

export async function setVocabularyStatus(
  vocabularyId: string,
  studentId: string,
  status: "new" | "learning" | "reviewing" | "mastered",
) {
  const teacher = await requireTeacher();
  await db
    .update(vocabularyItems)
    .set({ status })
    .where(
      and(
        eq(vocabularyItems.id, vocabularyId),
        eq(vocabularyItems.teacherId, teacher.id),
      ),
    );
  refresh(studentId);
}

export async function deleteVocabulary(
  vocabularyId: string,
  studentId: string,
  lessonId: string | null,
) {
  const teacher = await requireTeacher();
  await db
    .delete(vocabularyItems)
    .where(
      and(
        eq(vocabularyItems.id, vocabularyId),
        eq(vocabularyItems.teacherId, teacher.id),
      ),
    );
  refresh(studentId, lessonId);
}

// ---------------------------------------------------------------------------
// Homework
// ---------------------------------------------------------------------------

const homeworkSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  dueAt: z.string().trim().optional(),
});

export async function addHomework(
  studentId: string,
  lessonId: string | null,
  formData: FormData,
) {
  const teacher = await requireTeacher();
  await assertStudentOwned(teacher.id, studentId);
  if (lessonId) await assertLessonOwned(teacher.id, lessonId);
  const parsed = homeworkSchema.parse(Object.fromEntries(formData));

  await db.insert(homework).values({
    teacherId: teacher.id,
    studentId,
    lessonId,
    title: parsed.title,
    description: parsed.description || null,
    dueAt: parsed.dueAt ? new Date(parsed.dueAt) : null,
  });
  refresh(studentId, lessonId);
}

export async function setHomeworkStatus(
  homeworkId: string,
  studentId: string,
  status: "assigned" | "submitted" | "reviewed" | "completed" | "skipped",
) {
  const teacher = await requireTeacher();
  await db
    .update(homework)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(homework.id, homeworkId), eq(homework.teacherId, teacher.id)));
  refresh(studentId);
}

export async function deleteHomework(
  homeworkId: string,
  studentId: string,
  lessonId: string | null,
) {
  const teacher = await requireTeacher();
  await db
    .delete(homework)
    .where(and(eq(homework.id, homeworkId), eq(homework.teacherId, teacher.id)));
  refresh(studentId, lessonId);
}
