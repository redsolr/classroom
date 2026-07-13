"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  homework,
  students,
  vocabularyItems,
  vocabularyReviews,
} from "@/db";
import { deriveVocabularyStatus, nextSrsState } from "@/lib/srs";

const submitSchema = z.object({
  submissionText: z.string().trim().max(5000).optional(),
});

/**
 * Student homework check-off. The portal token is the sole authorization —
 * it resolves to exactly one student, and the update is scoped to that
 * student's own assigned homework. Submissions never complete homework
 * directly; the teacher reviews and closes it out.
 */
export async function submitHomeworkViaPortal(
  portalToken: string,
  homeworkId: string,
  formData: FormData,
) {
  const token = z.string().min(10).parse(portalToken);
  const hwId = z.string().uuid().parse(homeworkId);
  const parsed = submitSchema.parse(Object.fromEntries(formData));

  const student = await db.query.students.findFirst({
    where: eq(students.portalToken, token),
    columns: { id: true },
  });
  if (!student) throw new Error("Portal not found");

  const updated = await db
    .update(homework)
    .set({
      status: "submitted",
      submissionText: parsed.submissionText || null,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(homework.id, hwId),
        eq(homework.studentId, student.id),
        eq(homework.status, "assigned"),
      ),
    )
    .returning({ id: homework.id });

  if (updated.length === 0)
    throw new Error("Homework not found or already submitted");

  revalidatePath(`/p/${token}`);
}

const gradeSchema = z.enum(["again", "hard", "good", "easy"]);

/**
 * Student flashcard review. Applies SM-2-lite scheduling, logs the review,
 * and derives the pipeline status from the new SRS evidence — this is what
 * makes the teacher's vocabulary pipeline move on its own.
 */
export async function reviewVocabularyViaPortal(
  portalToken: string,
  vocabularyItemId: string,
  grade: "again" | "hard" | "good" | "easy",
) {
  const token = z.string().min(10).parse(portalToken);
  const itemId = z.string().uuid().parse(vocabularyItemId);
  const parsedGrade = gradeSchema.parse(grade);

  const student = await db.query.students.findFirst({
    where: eq(students.portalToken, token),
    columns: { id: true, teacherId: true },
  });
  if (!student) throw new Error("Portal not found");

  const item = await db.query.vocabularyItems.findFirst({
    where: and(
      eq(vocabularyItems.id, itemId),
      eq(vocabularyItems.studentId, student.id),
    ),
  });
  if (!item) throw new Error("Vocabulary item not found");

  const now = new Date();
  const next = nextSrsState(
    {
      reps: item.srsReps,
      easeFactor: item.srsEaseFactor,
      intervalDays: item.srsIntervalDays,
    },
    parsedGrade,
  );

  await db.transaction(async (tx) => {
    await tx
      .update(vocabularyItems)
      .set({
        srsReps: next.reps,
        srsEaseFactor: next.easeFactor,
        srsIntervalDays: next.intervalDays,
        srsDueAt: new Date(now.getTime() + next.dueInMs),
        lastReviewedAt: now,
        status: deriveVocabularyStatus(next),
      })
      .where(
        and(
          eq(vocabularyItems.id, itemId),
          eq(vocabularyItems.studentId, student.id),
        ),
      );

    await tx.insert(vocabularyReviews).values({
      teacherId: student.teacherId,
      studentId: student.id,
      vocabularyItemId: itemId,
      grade: parsedGrade,
      intervalDays: next.intervalDays,
      reviewedAt: now,
    });
  });

  revalidatePath(`/p/${token}`);
}
