import { desc, eq } from "drizzle-orm";
import { db, studyThreads } from "@/db";
import { getLearner } from "@/lib/auth";

export type SidebarThread = {
  id: string;
  title: string | null;
  language: string;
  pinned: boolean;
};

/**
 * The signed-in account's study threads for the sidebar chat tree.
 * Every authed layout calls this (the SELF-STUDY section is part of the
 * one app sidebar); returns [] for accounts that never opened /study.
 */
export async function getSidebarStudyThreads(): Promise<SidebarThread[]> {
  const learner = await getLearner();
  if (!learner) return [];
  return db
    .select({
      id: studyThreads.id,
      title: studyThreads.title,
      language: studyThreads.language,
      pinned: studyThreads.pinned,
    })
    .from(studyThreads)
    .where(eq(studyThreads.learnerId, learner.id))
    .orderBy(desc(studyThreads.updatedAt))
    .limit(50);
}
