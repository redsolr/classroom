"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, homework, students } from "@/db";

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
