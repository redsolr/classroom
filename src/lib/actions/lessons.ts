"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  corrections,
  db,
  homework,
  insights,
  lessons,
  lessonTopics,
  vocabularyItems,
} from "@/db";
import { requireTeacher } from "@/lib/auth";
import { assertLessonOwned, assertStudentOwned } from "@/lib/guards";
import { lessonDraftSchema } from "@/lib/ai/draft-schema";

const createLessonSchema = z.object({
  studentId: z.string().uuid(),
  title: z.string().trim().optional(),
  startedAt: z.string().trim().min(1),
  // An empty form field arrives as "" — treat it as "no duration", not 0.
  durationMinutes: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  sourceType: z
    .enum(["manual", "notes", "chat", "transcript", "audio"])
    .default("notes"),
});

export async function createLesson(formData: FormData) {
  const teacher = await requireTeacher();
  const parsed = createLessonSchema.parse(Object.fromEntries(formData));
  await assertStudentOwned(teacher.id, parsed.studentId);

  const [created] = await db
    .insert(lessons)
    .values({
      teacherId: teacher.id,
      studentId: parsed.studentId,
      title: parsed.title || null,
      startedAt: new Date(parsed.startedAt),
      durationMinutes: parsed.durationMinutes ?? null,
      sourceType: parsed.sourceType,
    })
    .returning({ id: lessons.id });

  revalidatePath("/lessons");
  redirect(`/lessons/${created.id}`);
}

const lessonFieldsSchema = z.object({
  title: z.string().trim().optional(),
  rawInput: z.string().optional(),
  teacherPrivateNotes: z.string().optional(),
  summary: z.string().optional(),
  nextLessonFocus: z.string().optional(),
});

export async function updateLessonFields(lessonId: string, formData: FormData) {
  const teacher = await requireTeacher();
  await assertLessonOwned(teacher.id, lessonId);
  const raw = Object.fromEntries(formData);
  const parsed = lessonFieldsSchema.parse(raw);

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if ("title" in raw) set.title = parsed.title || null;
  if ("rawInput" in raw) set.rawInput = parsed.rawInput || null;
  if ("teacherPrivateNotes" in raw)
    set.teacherPrivateNotes = parsed.teacherPrivateNotes || null;
  if ("summary" in raw) set.summary = parsed.summary || null;
  if ("nextLessonFocus" in raw)
    set.nextLessonFocus = parsed.nextLessonFocus || null;

  await db
    .update(lessons)
    .set(set)
    .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)));

  revalidatePath(`/lessons/${lessonId}`);
}

export async function markLessonReviewed(lessonId: string) {
  const teacher = await requireTeacher();
  const { studentId } = await assertLessonOwned(teacher.id, lessonId);

  await db
    .update(lessons)
    .set({ status: "reviewed", updatedAt: new Date() })
    .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)));

  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/lessons");
}

export async function deleteLesson(lessonId: string) {
  const teacher = await requireTeacher();
  const { studentId } = await assertLessonOwned(teacher.id, lessonId);

  await db
    .delete(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)));

  revalidatePath("/lessons");
  revalidatePath(`/students/${studentId}`);
  redirect("/lessons");
}

// ---------------------------------------------------------------------------
// Apply an (edited) AI draft: persist the approved items as real records.
// The teacher reviewed each item client-side; only kept items arrive here.
// ---------------------------------------------------------------------------

export async function applyLessonDraft(lessonId: string, draftJson: string) {
  const teacher = await requireTeacher();
  const { studentId } = await assertLessonOwned(teacher.id, lessonId);

  const draft = lessonDraftSchema.parse(JSON.parse(draftJson));

  const lessonRow = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)),
  });
  if (!lessonRow) throw new Error("Lesson not found");

  await db.transaction(async (tx) => {
    if (draft.topics.length > 0) {
      await tx.insert(lessonTopics).values(
        draft.topics.map((t) => ({
          teacherId: teacher.id,
          lessonId,
          title: t.title,
          description: t.description ?? null,
        })),
      );
    }

    if (draft.corrections.length > 0) {
      await tx.insert(corrections).values(
        draft.corrections.map((c) => ({
          teacherId: teacher.id,
          studentId,
          lessonId,
          category: c.category,
          originalText: c.originalText,
          correctedText: c.correctedText,
          explanation: c.explanation ?? null,
          teacherApproved: true,
        })),
      );
    }

    if (draft.vocabulary.length > 0) {
      await tx.insert(vocabularyItems).values(
        draft.vocabulary.map((v) => ({
          teacherId: teacher.id,
          studentId,
          lessonId,
          term: v.term,
          meaning: v.meaning ?? null,
          translation: v.translation ?? null,
          example: v.example ?? null,
          language: v.language ?? null,
          status: "new" as const,
        })),
      );
    }

    if (draft.homework.length > 0) {
      await tx.insert(homework).values(
        draft.homework.map((h) => ({
          teacherId: teacher.id,
          studentId,
          lessonId,
          title: h.title,
          description: h.description ?? null,
          status: "assigned" as const,
        })),
      );
    }

    if (draft.insights.length > 0) {
      await tx.insert(insights).values(
        draft.insights.map((i) => ({
          teacherId: teacher.id,
          studentId,
          sourceLessonId: lessonId,
          type: i.type,
          title: i.title,
          description: i.description ?? null,
          teacherApproved: true,
        })),
      );
    }

    await tx
      .update(lessons)
      .set({
        summary: draft.summary || lessonRow.summary,
        nextLessonFocus:
          draft.nextLessonSuggestion || lessonRow.nextLessonFocus,
        studentVisibleSummary:
          lessonRow.studentVisibleSummary ?? (draft.studentRecapDraft || null),
        aiDraft: null,
        status: "reviewed",
        updatedAt: new Date(),
      })
      .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)));
  });

  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/lessons");
  revalidatePath("/dashboard");
}

/** Discard a pending AI draft without saving anything. */
export async function discardLessonDraft(lessonId: string) {
  const teacher = await requireTeacher();
  await assertLessonOwned(teacher.id, lessonId);

  await db
    .update(lessons)
    .set({ aiDraft: null, updatedAt: new Date() })
    .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)));

  revalidatePath(`/lessons/${lessonId}`);
}

// ---------------------------------------------------------------------------
// Recap sharing
// ---------------------------------------------------------------------------

const recapSchema = z.object({
  studentVisibleSummary: z.string().trim().min(1, "Recap summary is required"),
  recapMessage: z.string().trim().optional(),
});

export async function shareRecap(lessonId: string, formData: FormData) {
  const teacher = await requireTeacher();
  const { studentId } = await assertLessonOwned(teacher.id, lessonId);
  const parsed = recapSchema.parse(Object.fromEntries(formData));

  const lessonRow = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)),
    columns: { recapToken: true },
  });

  const token =
    lessonRow?.recapToken ?? randomBytes(18).toString("base64url");

  await db
    .update(lessons)
    .set({
      studentVisibleSummary: parsed.studentVisibleSummary,
      recapMessage: parsed.recapMessage || null,
      recapToken: token,
      recapSharedAt: new Date(),
      status: "shared",
      updatedAt: new Date(),
    })
    .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)));

  revalidatePath(`/lessons/${lessonId}`);
  revalidatePath(`/students/${studentId}`);
}

export async function unshareRecap(lessonId: string) {
  const teacher = await requireTeacher();
  await assertLessonOwned(teacher.id, lessonId);

  await db
    .update(lessons)
    .set({
      recapToken: null,
      recapSharedAt: null,
      status: "reviewed",
      updatedAt: new Date(),
    })
    .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)));

  revalidatePath(`/lessons/${lessonId}`);
}
