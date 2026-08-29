import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  studyProjects,
  studyThreads,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { getLearner } from "@/lib/auth";

export type SidebarThread = {
  id: string;
  title: string | null;
  language: string | null;
  pinned: boolean;
  projectId: string | null;
};

export type SidebarProject = {
  id: string;
  name: string;
  language: string | null;
  threads: SidebarThread[];
};

export type SidebarBook = {
  id: string;
  name: string;
  wordCount: number;
};

export type SidebarStudy = {
  projects: SidebarProject[];
  /** Pinned chats, floated out of their groups. */
  pinned: SidebarThread[];
  /** Pinned vocabulary books — one-tap open + quick-add. */
  pinnedBooks: SidebarBook[];
  /** Loose chats (no project). */
  chats: SidebarThread[];
};

const EMPTY: SidebarStudy = {
  projects: [],
  pinned: [],
  pinnedBooks: [],
  chats: [],
};

/**
 * The signed-in account's study tree for the sidebar (projects with
 * their chat history + pinned + loose chats). Every authed layout calls
 * this; [] shapes for accounts that never opened /chat.
 */
export async function getSidebarStudy(): Promise<SidebarStudy> {
  const learner = await getLearner();
  if (!learner) return EMPTY;

  const [projects, threads, pinnedBooks] = await Promise.all([
    db
      .select({
        id: studyProjects.id,
        name: studyProjects.name,
        language: studyProjects.language,
      })
      .from(studyProjects)
      .where(eq(studyProjects.learnerId, learner.id))
      .orderBy(asc(studyProjects.name)),
    db
      .select({
        id: studyThreads.id,
        title: studyThreads.title,
        language: studyThreads.language,
        pinned: studyThreads.pinned,
        projectId: studyThreads.projectId,
      })
      .from(studyThreads)
      .where(eq(studyThreads.learnerId, learner.id))
      .orderBy(desc(studyThreads.updatedAt))
      .limit(100),
    db
      .select({
        id: studyVocabLists.id,
        name: studyVocabLists.name,
        wordCount: sql<number>`count(${studyVocabListItems.id})::int`,
      })
      .from(studyVocabLists)
      .leftJoin(
        studyVocabListItems,
        eq(studyVocabListItems.listId, studyVocabLists.id),
      )
      .where(
        and(
          eq(studyVocabLists.learnerId, learner.id),
          eq(studyVocabLists.pinned, true),
        ),
      )
      .groupBy(studyVocabLists.id)
      .orderBy(asc(studyVocabLists.name)),
  ]);

  const pinned = threads.filter((t) => t.pinned);
  const byProject = new Map<string, SidebarThread[]>();
  const chats: SidebarThread[] = [];
  for (const thread of threads) {
    if (thread.pinned) continue;
    if (thread.projectId) {
      const list = byProject.get(thread.projectId) ?? [];
      list.push(thread);
      byProject.set(thread.projectId, list);
    } else {
      chats.push(thread);
    }
  }

  return {
    projects: projects.map((p) => ({
      ...p,
      threads: byProject.get(p.id) ?? [],
    })),
    pinned,
    pinnedBooks,
    chats,
  };
}
