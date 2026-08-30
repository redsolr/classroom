import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  studyProjects,
  studyThreads,
  studyDeckItems,
  studyDecks,
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

export type SidebarDeck = {
  id: string;
  name: string;
  wordCount: number;
};

export type SidebarStudy = {
  projects: SidebarProject[];
  /** Pinned chats, floated out of their groups. */
  pinned: SidebarThread[];
  /** Pinned DECKS — one-tap open + quick-add. Books contain decks now
   * (2026-08-30); what you pin for a fast add is the word list. */
  pinnedDecks: SidebarDeck[];
  /** Loose chats (no project). */
  chats: SidebarThread[];
};

const EMPTY: SidebarStudy = {
  projects: [],
  pinned: [],
  pinnedDecks: [],
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

  const [projects, threads, pinnedDecks] = await Promise.all([
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
        id: studyDecks.id,
        name: studyDecks.name,
        wordCount: sql<number>`count(${studyDeckItems.id})::int`,
      })
      .from(studyDecks)
      .leftJoin(
        studyDeckItems,
        eq(studyDeckItems.deckId, studyDecks.id),
      )
      .where(
        and(
          eq(studyDecks.learnerId, learner.id),
          eq(studyDecks.pinned, true),
        ),
      )
      .groupBy(studyDecks.id)
      .orderBy(asc(studyDecks.name)),
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
    pinnedDecks,
    chats,
  };
}
