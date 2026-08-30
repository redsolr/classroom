"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, studyPathEnrollments, studyPaths } from "@/db";
import { requireLearner } from "@/lib/auth";

/**
 * Learning-path actions.
 *
 * There are only two, and that is the point: a path is content, and
 * progress through it is derived from review evidence (see
 * `lib/study-path-queries.ts`). There is no "complete this step" action
 * because there is nothing a learner could press that would be true —
 * the step is done when the work is done.
 *
 * Enrolling is therefore not a state machine, just a bookmark: it says
 * "this is the one I am following", which is what lets Home point at one
 * path instead of a menu of them.
 */

const slugSchema = z.string().trim().min(1).max(80);

export async function followStudyPath(slug: string): Promise<void> {
  const learner = await requireLearner();
  const parsed = slugSchema.parse(slug);

  const path = await db.query.studyPaths.findFirst({
    where: eq(studyPaths.slug, parsed),
    columns: { id: true },
  });
  if (!path) throw new Error("Learning path not found");

  await db
    .insert(studyPathEnrollments)
    .values({ learnerId: learner.id, pathId: path.id })
    // Following a path twice is not an error, it is a double tap.
    .onConflictDoNothing();

  revalidatePath("/path");
  revalidatePath("/home");
}

export async function unfollowStudyPath(slug: string): Promise<void> {
  const learner = await requireLearner();
  const parsed = slugSchema.parse(slug);

  const path = await db.query.studyPaths.findFirst({
    where: eq(studyPaths.slug, parsed),
    columns: { id: true },
  });
  if (!path) throw new Error("Learning path not found");

  // Only ever the caller's own enrolment — the learner id is part of the
  // predicate, not something checked beforehand.
  await db
    .delete(studyPathEnrollments)
    .where(
      and(
        eq(studyPathEnrollments.learnerId, learner.id),
        eq(studyPathEnrollments.pathId, path.id),
      ),
    );

  revalidatePath("/path");
  revalidatePath("/home");
}
