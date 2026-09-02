"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, lessons } from "@/db";
import { requireTeacher } from "@/lib/auth";
import { assertLessonOwned } from "@/lib/guards";
import { draftLessonFromEvidence } from "@/lib/lesson-draft";

/**
 * Process the lesson's input into a structured draft. The draft is
 * stored on the lesson (aiDraft) for teacher review — nothing is written
 * to the permanent student record until the teacher approves it.
 *
 * The work lives in `lib/lesson-draft.ts`, shared with the recording
 * pipeline; this action is the teacher's door to it. When the lesson
 * was recorded, the transcript rides along automatically — the notes
 * typed here are added to it, never a replacement for it.
 */
export type ProcessResult = { ok: true } | { ok: false; error: string };

export async function processLessonWithAI(
  lessonId: string,
  rawInput: string,
): Promise<ProcessResult> {
  const teacher = await requireTeacher();
  await assertLessonOwned(teacher.id, lessonId);

  // Persist the notes first so nothing is lost if extraction fails. An
  // empty box is stored as null, not as "": the extractor decides
  // whether there is anything to work from, transcript included.
  const trimmed = rawInput.trim();
  await db
    .update(lessons)
    .set({ rawInput: trimmed || null, updatedAt: new Date() })
    .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id)));

  let outcome;
  try {
    outcome = await draftLessonFromEvidence({ lessonId, teacherId: teacher.id });
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
  if (!outcome.ok) return outcome;

  revalidatePath(`/lessons/${lessonId}`);
  return { ok: true };
}
