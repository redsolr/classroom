"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  learners,
  studyMemories,
} from "@/db";
import { requireLearner } from "@/lib/auth";

/**
 * What the tutor remembers, and the standing instructions the learner
 * writes for it. Separate from chat because the learner MANAGES this on
 * /account — it is their context, not a property of a conversation.
 */

// ---------------------------------------------------------------------------
// Memory — the tutor SAVES via its remember/forget chat tools; the learner
// manages the list on /account. Delete-only here by design: adding
// happens in conversation ("remember that …"), like ChatGPT/Claude memory.
// ---------------------------------------------------------------------------

export async function deleteStudyMemory(memoryId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(memoryId);

  await db
    .delete(studyMemories)
    .where(
      and(eq(studyMemories.id, id), eq(studyMemories.learnerId, learner.id)),
    );

  revalidatePath("/account");
}

export async function deleteAllStudyMemories() {
  const learner = await requireLearner();

  await db
    .delete(studyMemories)
    .where(eq(studyMemories.learnerId, learner.id));

  revalidatePath("/account");
}

/** Pause = stop saving AND stop injecting; saved rows are kept. */
export async function setStudyMemoryEnabled(enabled: boolean) {
  const learner = await requireLearner();

  await db
    .update(learners)
    .set({ memoryEnabled: z.boolean().parse(enabled), updatedAt: new Date() })
    .where(eq(learners.id, learner.id));

  revalidatePath("/account");
}

/**
 * The account-level "About you" standing instructions (ChatGPT Custom
 * Instructions shape) — learner-written, injected into every chat.
 */
export async function updateStudyInstructions(formData: FormData) {
  const learner = await requireLearner();
  const instructions = z
    .string()
    .trim()
    .max(4000)
    .parse(formData.get("instructions") ?? "");

  await db
    .update(learners)
    .set({ instructions: instructions || null, updatedAt: new Date() })
    .where(eq(learners.id, learner.id));

  revalidatePath("/account");
}
