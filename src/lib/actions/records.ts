"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  corrections,
  db,
  homework,
  lessonTopics,
  vocabularyBooks,
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
  bookId: z.string().uuid().optional().or(z.literal("")),
});

/** The teacher's book for this student, or throw — every book op goes
 * through this (a book id from another teacher/student must 404). */
async function assertBookOwned(
  teacherId: string,
  studentId: string,
  bookId: string,
) {
  const book = await db.query.vocabularyBooks.findFirst({
    where: and(
      eq(vocabularyBooks.id, bookId),
      eq(vocabularyBooks.teacherId, teacherId),
      eq(vocabularyBooks.studentId, studentId),
    ),
  });
  if (!book) throw new Error("Book not found");
  return book;
}

export async function addVocabulary(
  studentId: string,
  lessonId: string | null,
  formData: FormData,
) {
  const teacher = await requireTeacher();
  await assertStudentOwned(teacher.id, studentId);
  if (lessonId) await assertLessonOwned(teacher.id, lessonId);
  const parsed = vocabularySchema.parse(Object.fromEntries(formData));
  const bookId = parsed.bookId || null;
  if (bookId) await assertBookOwned(teacher.id, studentId, bookId);

  await db.insert(vocabularyItems).values({
    teacherId: teacher.id,
    studentId,
    lessonId,
    bookId,
    term: parsed.term,
    meaning: parsed.meaning || null,
    translation: parsed.translation || null,
    example: parsed.example || null,
    language: parsed.language || null,
  });
  refresh(studentId, lessonId);
}

// ---------------------------------------------------------------------------
// Vocabulary books — teacher-curated collections per student ("JLPT N4
// prep"). A live shared surface: the student sees them grouped in the
// portal and reviews through the same SRS pipeline.
// ---------------------------------------------------------------------------

export async function createVocabularyBook(studentId: string, name: string) {
  const teacher = await requireTeacher();
  await assertStudentOwned(teacher.id, studentId);
  const parsedName = z.string().trim().min(1).max(80).parse(name);

  await db.insert(vocabularyBooks).values({
    teacherId: teacher.id,
    studentId,
    name: parsedName,
  });
  refresh(studentId);
}

export async function renameVocabularyBook(
  bookId: string,
  studentId: string,
  name: string,
) {
  const teacher = await requireTeacher();
  const book = await assertBookOwned(teacher.id, studentId, bookId);
  const parsedName = z.string().trim().min(1).max(80).parse(name);

  await db
    .update(vocabularyBooks)
    .set({ name: parsedName, updatedAt: new Date() })
    .where(eq(vocabularyBooks.id, book.id));
  refresh(studentId);
}

/** Deleting a book frees its words (FK sets book_id null). */
export async function deleteVocabularyBook(bookId: string, studentId: string) {
  const teacher = await requireTeacher();
  const book = await assertBookOwned(teacher.id, studentId, bookId);

  await db.delete(vocabularyBooks).where(eq(vocabularyBooks.id, book.id));
  refresh(studentId);
}

/** File a word into a book (null = back to loose). */
export async function setVocabularyBook(
  vocabularyId: string,
  studentId: string,
  bookId: string | null,
) {
  const teacher = await requireTeacher();
  if (bookId) await assertBookOwned(teacher.id, studentId, bookId);

  await db
    .update(vocabularyItems)
    .set({ bookId })
    .where(
      and(
        eq(vocabularyItems.id, vocabularyId),
        eq(vocabularyItems.teacherId, teacher.id),
      ),
    );
  refresh(studentId);
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
