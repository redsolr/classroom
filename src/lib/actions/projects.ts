"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  studyProjects,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { revalidateStudyTree } from "@/lib/study-revalidate";

/**
 * Projects — ChatGPT-Projects-shaped containers: a name plus standing
 * instructions injected into every chat inside them.
 */

// Projects are generic containers (2026-08-14): name + instructions
// only. The legacy `language` column stays readable as a filing default
// on old rows but is never written from the UI anymore.
const projectSchema = z.object({
  name: z.string().trim().min(1).max(80),
  instructions: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

function parseProjectForm(formData: FormData) {
  return projectSchema.parse({
    name: formData.get("name"),
    instructions: formData.get("instructions") || undefined,
  });
}

/**
 * ChatGPT behavior: creating a project just adds the folder to the
 * sidebar — the caller (a dialog) closes and the learner stays where
 * they are. No redirect to the settings page.
 */
export async function createStudyProject(
  formData: FormData,
): Promise<{ id: string }> {
  const learner = await requireLearner();
  const parsed = parseProjectForm(formData);

  const [project] = await db
    .insert(studyProjects)
    .values({
      learnerId: learner.id,
      name: parsed.name,
      instructions: parsed.instructions ?? null,
    })
    .returning({ id: studyProjects.id });

  revalidateStudyTree();
  return { id: project.id };
}

export async function updateStudyProject(
  projectId: string,
  formData: FormData,
) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(projectId);
  const parsed = parseProjectForm(formData);

  // `language` deliberately untouched: legacy rows keep their filing
  // default; the UI no longer writes it.
  const updated = await db
    .update(studyProjects)
    .set({
      name: parsed.name,
      instructions: parsed.instructions ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(studyProjects.id, id), eq(studyProjects.learnerId, learner.id)),
    )
    .returning({ id: studyProjects.id });
  if (updated.length === 0) throw new Error("Project not found");

  revalidatePath(`/project/${id}`);
  revalidateStudyTree();
}

/** Chats survive project deletion (FK sets project_id null → "Chats"). */
export async function deleteStudyProject(projectId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(projectId);

  await db
    .delete(studyProjects)
    .where(
      and(eq(studyProjects.id, id), eq(studyProjects.learnerId, learner.id)),
    );

  revalidateStudyTree();
  redirect("/chat");
}
