"use server";

import { redirect } from "next/navigation";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  studyBooks,
  studyMessages,
  studyProjects,
  studyThreads,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { languageSchema } from "@/lib/study-books";
import { revalidateStudyTree } from "@/lib/study-revalidate";

/**
 * Chat threads — creating, renaming, pinning, moving, branching and
 * deleting the conversations themselves. What a chat SAYS is the /api
 * route's business; this is the tree around it.
 */

// ---------------------------------------------------------------------------
// Threads — generic by default; created inside a project they inherit
// its language (tutor mode).
// ---------------------------------------------------------------------------

export async function createStudyThread(formData: FormData) {
  const learner = await requireLearner();
  const projectId = formData.get("projectId");

  let project: { id: string; language: string | null } | undefined;
  if (projectId) {
    const id = z.string().uuid().parse(projectId);
    project = await db.query.studyProjects.findFirst({
      where: and(
        eq(studyProjects.id, id),
        eq(studyProjects.learnerId, learner.id),
      ),
      columns: { id: true, language: true },
    });
    if (!project) throw new Error("Project not found");
  }

  // A book chat: the library book's summary + notes ride into the
  // chat's context (see /api/study/chat). Generic — never tutor mode.
  const bookIdRaw = formData.get("bookId");
  let book: { id: string } | undefined;
  if (bookIdRaw) {
    const id = z.string().uuid().parse(bookIdRaw);
    book = await db.query.studyBooks.findFirst({
      where: and(eq(studyBooks.id, id), eq(studyBooks.learnerId, learner.id)),
      columns: { id: true },
    });
    if (!book) throw new Error("Book not found");
  }

  // Legacy path (pre-projects forms): a bare language creates a loose
  // tutor chat.
  const rawLanguage = formData.get("language");
  const language =
    project?.language ??
    (rawLanguage ? languageSchema.parse(rawLanguage) : null);

  // ChatGPT behavior: reuse an existing EMPTY chat in the same container
  // instead of stacking blank "French chat" rows on every tap.
  const [existingEmpty] = await db
    .select({ id: studyThreads.id })
    .from(studyThreads)
    .where(
      and(
        eq(studyThreads.learnerId, learner.id),
        project
          ? eq(studyThreads.projectId, project.id)
          : isNull(studyThreads.projectId),
        book
          ? eq(studyThreads.bookId, book.id)
          : isNull(studyThreads.bookId),
        sql`not exists (select 1 from study_messages m where m.thread_id = ${studyThreads.id})`,
      ),
    )
    .limit(1);
  if (existingEmpty) {
    redirect(`/chat?t=${existingEmpty.id}`);
  }

  const [thread] = await db
    .insert(studyThreads)
    .values({
      learnerId: learner.id,
      projectId: project?.id ?? null,
      bookId: book?.id ?? null,
      language,
    })
    .returning({ id: studyThreads.id });

  revalidateStudyTree();
  redirect(`/chat?t=${thread.id}`);
}

/**
 * The Ask dock's thread supply — a loose GENERIC chat, created without
 * navigation (the dock lives on top of whatever page the learner is
 * on). Reuses an empty loose generic thread, same anti-littering rule
 * as createStudyThread.
 */
export async function createStudyAskThread(): Promise<{ id: string }> {
  const learner = await requireLearner();

  const [existingEmpty] = await db
    .select({ id: studyThreads.id })
    .from(studyThreads)
    .where(
      and(
        eq(studyThreads.learnerId, learner.id),
        isNull(studyThreads.projectId),
        isNull(studyThreads.bookId),
        isNull(studyThreads.language),
        sql`not exists (select 1 from study_messages m where m.thread_id = ${studyThreads.id})`,
      ),
    )
    .limit(1);
  if (existingEmpty) return { id: existingEmpty.id };

  const [thread] = await db
    .insert(studyThreads)
    .values({ learnerId: learner.id, projectId: null, language: null })
    .returning({ id: studyThreads.id });

  revalidateStudyTree();
  return { id: thread.id };
}

/**
 * Open (or resume) the Ask dock's conversation: with a thread id, load
 * that thread's transcript; without one (or if it's gone), fall back to
 * createStudyAskThread. The dock unmounts when closed — this is how the
 * transcript survives close/reopen and even a full reload.
 */
export async function loadStudyAskThread(threadId: string | null): Promise<{
  id: string;
  messages: {
    id: string;
    role: "user" | "assistant";
    content: string;
    model: string | null;
  }[];
}> {
  const learner = await requireLearner();

  let id: string | null = null;
  if (threadId) {
    const parsed = z.string().uuid().parse(threadId);
    const thread = await db.query.studyThreads.findFirst({
      where: and(
        eq(studyThreads.id, parsed),
        eq(studyThreads.learnerId, learner.id),
      ),
      columns: { id: true },
    });
    id = thread?.id ?? null;
  }
  if (!id) {
    ({ id } = await createStudyAskThread());
    return { id, messages: [] };
  }

  const messages = await db
    .select({
      id: studyMessages.id,
      role: studyMessages.role,
      content: studyMessages.content,
      model: studyMessages.model,
    })
    .from(studyMessages)
    .where(
      and(
        eq(studyMessages.threadId, id),
        eq(studyMessages.learnerId, learner.id),
      ),
    )
    .orderBy(asc(studyMessages.createdAt));
  return { id, messages };
}

export async function toggleStudyThreadPin(threadId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(threadId);

  const thread = await db.query.studyThreads.findFirst({
    where: and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learner.id)),
    columns: { pinned: true },
  });
  if (!thread) throw new Error("Thread not found");

  await db
    .update(studyThreads)
    .set({ pinned: !thread.pinned })
    .where(
      and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learner.id)),
    );

  revalidateStudyTree();
}

/**
 * No redirect here — the sidebar deletes chats the learner isn't even
 * viewing (ChatGPT-style row menus), and yanking them to /chat would be
 * hostile. The chat header's own menu navigates after deleting.
 */
export async function deleteStudyThread(threadId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(threadId);

  await db
    .delete(studyThreads)
    .where(
      and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learner.id)),
    );

  revalidateStudyTree();
}

export async function renameStudyThread(threadId: string, title: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(threadId);
  const parsedTitle = z.string().trim().min(1).max(120).parse(title);

  const updated = await db
    .update(studyThreads)
    .set({ title: parsedTitle, updatedAt: new Date() })
    .where(
      and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learner.id)),
    )
    .returning({ id: studyThreads.id });
  if (updated.length === 0) throw new Error("Chat not found");

  revalidateStudyTree();
}

/**
 * ChatGPT's "Move to project": reassign the chat's container — or null
 * to pull it back out into loose Chats. The chat itself (messages,
 * title, language) is untouched; only where it lives changes.
 */
export async function moveStudyThreadToProject(
  threadId: string,
  projectId: string | null,
) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(threadId);
  const targetId =
    projectId === null ? null : z.string().uuid().parse(projectId);

  if (targetId) {
    const project = await db.query.studyProjects.findFirst({
      where: and(
        eq(studyProjects.id, targetId),
        eq(studyProjects.learnerId, learner.id),
      ),
      columns: { id: true },
    });
    if (!project) throw new Error("Project not found");
  }

  const updated = await db
    .update(studyThreads)
    .set({ projectId: targetId, updatedAt: new Date() })
    .where(
      and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learner.id)),
    )
    .returning({ id: studyThreads.id });
  if (updated.length === 0) throw new Error("Chat not found");

  revalidateStudyTree();
}

/**
 * ChatGPT's "Branch in new chat": a new thread in the same container
 * (project, language, title) carrying the conversation up to and
 * including the branched-from message. The cut point is the message's
 * position in createdAt order — the client's list mirrors it because
 * the stream route persists the assistant turn before closing.
 * No model call happens here, so the daily cap doesn't apply.
 */
export async function branchStudyThread(
  threadId: string,
  messageCount: number,
) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(threadId);
  const count = z.number().int().min(1).max(1000).parse(messageCount);

  const thread = await db.query.studyThreads.findFirst({
    where: and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learner.id)),
    columns: { id: true, projectId: true, language: true, title: true },
  });
  if (!thread) throw new Error("Chat not found");

  const rows = await db
    .select({
      role: studyMessages.role,
      content: studyMessages.content,
      model: studyMessages.model,
    })
    .from(studyMessages)
    .where(
      and(
        eq(studyMessages.threadId, thread.id),
        eq(studyMessages.learnerId, learner.id),
      ),
    )
    .orderBy(asc(studyMessages.createdAt))
    .limit(count);
  if (rows.length === 0) throw new Error("Nothing to branch yet");

  const [branch] = await db
    .insert(studyThreads)
    .values({
      learnerId: learner.id,
      projectId: thread.projectId,
      language: thread.language,
      title: thread.title,
    })
    .returning({ id: studyThreads.id });

  // Explicit millisecond-stepped timestamps — a single defaultNow()
  // batch insert would leave the copied turns unordered.
  const base = Date.now();
  await db.insert(studyMessages).values(
    rows.map((row, i) => ({
      learnerId: learner.id,
      threadId: branch.id,
      role: row.role,
      content: row.content,
      model: row.model,
      createdAt: new Date(base + i),
    })),
  );

  revalidateStudyTree();
  redirect(`/chat?t=${branch.id}`);
}
