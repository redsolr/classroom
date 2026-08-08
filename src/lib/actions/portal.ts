"use server";

import { revalidatePath } from "next/cache";
import { and, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  aiMessages,
  corrections,
  db,
  goals,
  homework,
  lessons,
  students,
  vocabularyItems,
  vocabularyReviews,
} from "@/db";
import {
  generateCompanionReply,
  type CompanionContext,
  type CompanionTurn,
} from "@/lib/ai/companion";
import { srsReviewPatch } from "@/lib/srs";

const submitSchema = z.object({
  submissionText: z.string().trim().max(5000).optional(),
});

/** The portal token is the sole authorization — resolve it or throw. */
async function requirePortalStudent(portalToken: string) {
  const token = z.string().min(10).parse(portalToken);
  const student = await db.query.students.findFirst({
    where: eq(students.portalToken, token),
  });
  if (!student) throw new Error("Portal not found");
  return { token, student };
}

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
  const hwId = z.string().uuid().parse(homeworkId);
  const parsed = submitSchema.parse(Object.fromEntries(formData));
  const { token, student } = await requirePortalStudent(portalToken);

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

// ---------------------------------------------------------------------------
// AI study companion — grounded in the SHARED layer only (never insights,
// private notes, or raw lesson input). Conversations are stored: they are
// part of the learner's accumulating context.
// ---------------------------------------------------------------------------

const DAILY_MESSAGE_CAP = 30;
const HISTORY_TURNS = 12;

const companionMessageSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export async function sendCompanionMessage(
  portalToken: string,
  formData: FormData,
) {
  const parsed = companionMessageSchema.parse(Object.fromEntries(formData));
  const { token, student } = await requirePortalStudent(portalToken);

  // Simple brake: cap the student's messages per rolling day so a public
  // token can never run up an unbounded LLM bill.
  const [{ value: messagesToday }] = await db
    .select({ value: count() })
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.studentId, student.id),
        eq(aiMessages.role, "user"),
        gte(aiMessages.createdAt, sql`now() - interval '24 hours'`),
      ),
    );

  await db.insert(aiMessages).values({
    teacherId: student.teacherId,
    studentId: student.id,
    role: "user",
    content: parsed.message,
  });

  let reply: string;
  if (messagesToday >= DAILY_MESSAGE_CAP) {
    reply =
      "You've done a LOT of practice today — I love it, but that's my limit for one day. Rest your brain and come back tomorrow! 🌙";
  } else {
    const [
      activeGoals,
      recentCorrections,
      vocabulary,
      openHomework,
      recentSharedLessons,
      history,
    ] = await Promise.all([
      db
        .select()
        .from(goals)
        .where(
          and(eq(goals.studentId, student.id), eq(goals.status, "active")),
        ),
      db
        .select()
        .from(corrections)
        .where(eq(corrections.studentId, student.id))
        .orderBy(desc(corrections.createdAt))
        .limit(10),
      db
        .select()
        .from(vocabularyItems)
        .where(eq(vocabularyItems.studentId, student.id))
        .orderBy(desc(vocabularyItems.createdAt))
        .limit(20),
      db
        .select()
        .from(homework)
        .where(
          and(eq(homework.studentId, student.id), eq(homework.status, "assigned")),
        ),
      db
        .select({
          startedAt: lessons.startedAt,
          studentVisibleSummary: lessons.studentVisibleSummary,
        })
        .from(lessons)
        .where(
          and(
            eq(lessons.studentId, student.id),
            isNotNull(lessons.recapSharedAt),
            isNotNull(lessons.studentVisibleSummary),
          ),
        )
        .orderBy(desc(lessons.startedAt))
        .limit(2),
      db
        .select({ role: aiMessages.role, content: aiMessages.content })
        .from(aiMessages)
        .where(eq(aiMessages.studentId, student.id))
        .orderBy(desc(aiMessages.createdAt))
        .limit(HISTORY_TURNS),
    ]);

    const context: CompanionContext = {
      student,
      goals: activeGoals,
      recentCorrections,
      vocabulary,
      openHomework,
      recentSharedLessons,
    };
    // History came newest-first and includes the just-inserted user
    // message — flip it and drop the final user turn (passed separately).
    const turns: CompanionTurn[] = history
      .reverse()
      .filter((_, i, arr) => i < arr.length - 1);

    try {
      reply = await generateCompanionReply(context, turns, parsed.message);
    } catch (error) {
      console.error("sendCompanionMessage: companion reply failed", error);
      reply =
        "Sorry — I had trouble thinking just now. Please try again in a moment.";
    }
  }

  await db.insert(aiMessages).values({
    teacherId: student.teacherId,
    studentId: student.id,
    role: "assistant",
    content: reply,
  });

  revalidatePath(`/p/${token}/chat`);
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
  const itemId = z.string().uuid().parse(vocabularyItemId);
  const parsedGrade = gradeSchema.parse(grade);
  const { token, student } = await requirePortalStudent(portalToken);

  const item = await db.query.vocabularyItems.findFirst({
    where: and(
      eq(vocabularyItems.id, itemId),
      eq(vocabularyItems.studentId, student.id),
    ),
  });
  if (!item) throw new Error("Vocabulary item not found");

  const now = new Date();
  const patch = srsReviewPatch(
    {
      reps: item.srsReps,
      easeFactor: item.srsEaseFactor,
      intervalDays: item.srsIntervalDays,
    },
    parsedGrade,
    now,
  );

  await db.transaction(async (tx) => {
    await tx
      .update(vocabularyItems)
      .set(patch)
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
      intervalDays: patch.srsIntervalDays,
      reviewedAt: now,
    });
  });

  revalidatePath(`/p/${token}`);
}
