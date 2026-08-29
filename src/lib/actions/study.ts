"use server";

import { revalidatePath } from "next/cache";

/**
 * The sidebar chat tree is layout data (all three authed layouts fetch
 * it) — every thread/project mutation must revalidate the LAYOUT tree,
 * or action redirects (soft navigations) leave the sidebar stale.
 * Learned from e2e: a fresh project was invisible until a hard reload.
 */
function revalidateStudyTree() {
  revalidatePath("/", "layout");
}
import { redirect } from "next/navigation";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  learners,
  studyBooks,
  studyMemories,
  studyMessages,
  studyPackItems,
  studyPacks,
  studyProjects,
  studyThreads,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { STUDY_VOCAB_CATEGORIES } from "@/lib/study-vocab-categories";
import {
  extractVocabCandidates,
  vocabCandidateSchema,
  type VocabCandidate,
} from "@/lib/ai/vocab-extract";
import { requireLearner } from "@/lib/auth";
import {
  billingConfigured,
  dailyCapFor,
  getStripe,
  studyPriceId,
} from "@/lib/billing";
import { srsReviewPatch } from "@/lib/srs";
import { countTutorMessagesLast24h } from "@/lib/study-usage";

// ---------------------------------------------------------------------------
// Projects — ChatGPT-Projects-shaped: name + optional language (tutor
// mode) + optional standing instructions injected into every chat.
// ---------------------------------------------------------------------------

const languageSchema = z.string().trim().min(2).max(40);

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
 * A shuffled cram deck over the learner's whole vocabulary — the
 * "practice again" round after (or instead of) the due deck. Anki
 * convention: practicing NEVER reschedules; the SRS state stays
 * derived from real due reviews only, so the caller must not grade
 * these through reviewStudyVocab.
 */
export async function loadStudyPracticeDeck(listId?: string | null) {
  const learner = await requireLearner();
  const columns = {
    id: studyVocab.id,
    language: studyVocab.language,
    term: studyVocab.term,
    reading: studyVocab.reading,
    meaning: studyVocab.meaning,
    example: studyVocab.example,
  };

  // A cram round has to stay inside whatever the session was scoped to —
  // practising a book must not deal cards from the rest of the
  // vocabulary.
  if (listId) {
    const list = await requireOwnList(learner.id, listId);
    return db
      .select(columns)
      .from(studyVocab)
      .innerJoin(
        studyVocabListItems,
        eq(studyVocabListItems.vocabId, studyVocab.id),
      )
      .where(
        and(
          eq(studyVocab.learnerId, learner.id),
          eq(studyVocabListItems.listId, list.id),
        ),
      )
      .orderBy(sql`random()`)
      .limit(50);
  }

  return db
    .select(columns)
    .from(studyVocab)
    .where(eq(studyVocab.learnerId, learner.id))
    .orderBy(sql`random()`)
    .limit(50);
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

// ---------------------------------------------------------------------------
// Personal vocabulary
// ---------------------------------------------------------------------------

const vocabSchema = z.object({
  language: languageSchema,
  term: z.string().trim().min(1).max(200),
  reading: z.string().trim().max(200).optional(),
  meaning: z.string().trim().max(500).optional(),
  example: z.string().trim().max(1000).optional(),
  category: z.enum(STUDY_VOCAB_CATEGORIES).optional(),
});

export async function addStudyVocab(formData: FormData) {
  const learner = await requireLearner();
  const parsed = vocabSchema.parse({
    language: formData.get("language"),
    term: formData.get("term"),
    reading: formData.get("reading") || undefined,
    meaning: formData.get("meaning") || undefined,
    example: formData.get("example") || undefined,
    category: formData.get("category") || undefined,
  });

  await db.insert(studyVocab).values({
    learnerId: learner.id,
    language: parsed.language,
    term: parsed.term,
    reading: parsed.reading || null,
    meaning: parsed.meaning || null,
    example: parsed.example || null,
    category: parsed.category ?? null,
  });

  revalidatePath("/vocab");
}

/**
 * Edit-in-place from the vocab table. The patch covers the editable
 * columns only — SRS state and status stay evidence-derived, never
 * hand-edited.
 */
export async function updateStudyVocab(
  vocabId: string,
  patch: {
    language: string;
    term: string;
    reading?: string;
    meaning?: string;
    example?: string;
    category?: string;
  },
) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(vocabId);
  const parsed = vocabSchema.parse({
    ...patch,
    category: patch.category || undefined,
  });

  const updated = await db
    .update(studyVocab)
    .set({
      language: parsed.language,
      term: parsed.term,
      reading: parsed.reading || null,
      meaning: parsed.meaning || null,
      example: parsed.example || null,
      category: parsed.category ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)))
    .returning({ id: studyVocab.id });
  if (updated.length === 0) throw new Error("Vocabulary item not found");

  revalidatePath("/vocab");
}

export async function deleteStudyVocab(vocabId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(vocabId);

  await db
    .delete(studyVocab)
    .where(and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)));

  revalidatePath("/vocab");
}

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

/**
 * Resolve a thread the learner owns to its tutor language (project wins,
 * matching the chat route). Null = generic chat.
 */
async function resolveThreadLanguage(learnerId: string, threadId: string) {
  const id = z.string().uuid().parse(threadId);
  const thread = await db.query.studyThreads.findFirst({
    where: and(eq(studyThreads.id, id), eq(studyThreads.learnerId, learnerId)),
    columns: { id: true, language: true, projectId: true },
  });
  if (!thread) throw new Error("Chat not found");

  let language = thread.language;
  if (thread.projectId) {
    const project = await db.query.studyProjects.findFirst({
      where: and(
        eq(studyProjects.id, thread.projectId),
        eq(studyProjects.learnerId, learnerId),
      ),
      columns: { language: true },
    });
    language = project?.language ?? language;
  }
  return { threadId: thread.id, language };
}

/** The learner's saved terms in a language, lowercased for dedup. */
async function savedTermsFor(learnerId: string, language: string) {
  const rows = await db
    .select({ term: studyVocab.term })
    .from(studyVocab)
    .where(
      and(eq(studyVocab.learnerId, learnerId), eq(studyVocab.language, language)),
    );
  return new Set(rows.map((r) => r.term.toLowerCase()));
}

/** Cross-language dedup keys — `language:term`, lowercased. Extraction
 * candidates carry their own language now, so dedup must too. */
async function savedLanguageTermKeys(learnerId: string) {
  const rows = await db
    .select({ term: studyVocab.term, language: studyVocab.language })
    .from(studyVocab)
    .where(eq(studyVocab.learnerId, learnerId));
  return new Set(
    rows.map((r) => `${r.language.toLowerCase()}:${r.term.toLowerCase()}`),
  );
}

/**
 * Chat→vocab bulk extraction, step 1: propose candidates from the whole
 * conversation (LLM with a key, deterministic VOCAB-line mock without).
 * Proposes only — nothing is saved until the learner picks in step 2.
 * Gated on the same rolling-24h cap as tutor messages: with a key this
 * is a paid model call.
 */
export async function extractStudyVocab(threadId: string): Promise<{
  candidates: VocabCandidate[];
}> {
  const learner = await requireLearner();
  // Works on ANY chat — the thread's legacy language, when present, is
  // only a fallback fill for candidates the model couldn't place.
  const { threadId: id, language } = await resolveThreadLanguage(
    learner.id,
    threadId,
  );

  const cap = dailyCapFor(learner);
  if ((await countTutorMessagesLast24h(learner.id)) >= cap) {
    throw new Error(
      "You've used today's tutor allowance — extraction runs the model too. Try again tomorrow or upgrade.",
    );
  }

  const [turns, savedKeys] = await Promise.all([
    db
      .select({ role: studyMessages.role, content: studyMessages.content })
      .from(studyMessages)
      .where(eq(studyMessages.threadId, id))
      .orderBy(asc(studyMessages.createdAt)),
    savedLanguageTermKeys(learner.id),
  ]);

  const candidates = (
    await extractVocabCandidates(language, turns, [
      ...new Set([...savedKeys].map((k) => k.split(":").slice(1).join(":"))),
    ])
  )
    // Fill undetermined languages from the thread default; a candidate
    // with neither can't be filed — drop it rather than show a chip
    // that cannot save.
    .map((c) => ({ ...c, language: c.language ?? language }))
    .filter(
      (c): c is VocabCandidate & { language: string } => c.language !== null,
    )
    .filter(
      (c) =>
        !savedKeys.has(`${c.language.toLowerCase()}:${c.term.toLowerCase()}`),
    );

  return { candidates };
}

const bulkItemsSchema = z.array(vocabCandidateSchema).min(1).max(40);

/**
 * Step 2: save the candidates the learner picked. Each item carries its
 * own language (thread legacy language as server-side fallback; items
 * with neither are skipped), and already-saved terms are skipped again
 * — the list may have changed since extraction.
 */
export async function addStudyVocabBulk(
  threadId: string,
  items: VocabCandidate[],
): Promise<{ added: number }> {
  const learner = await requireLearner();
  const { language: threadLanguage } = await resolveThreadLanguage(
    learner.id,
    threadId,
  );

  const parsed = bulkItemsSchema.parse(items);
  const savedKeys = await savedLanguageTermKeys(learner.id);

  const fresh: { term: string; reading: string | null; meaning: string | null; language: string }[] =
    [];
  for (const item of parsed) {
    const language = item.language ?? threadLanguage;
    if (!language) continue;
    const key = `${language.toLowerCase()}:${item.term.toLowerCase()}`;
    if (savedKeys.has(key)) continue;
    savedKeys.add(key); // also dedups within the submitted batch
    fresh.push({
      term: item.term,
      reading: item.reading,
      meaning: item.meaning,
      language,
    });
  }

  if (fresh.length > 0) {
    await db.insert(studyVocab).values(
      fresh.map((item) => ({
        learnerId: learner.id,
        language: item.language,
        term: item.term,
        reading: item.reading || null,
        meaning: item.meaning || null,
      })),
    );
    revalidatePath("/vocab");
  }

  return { added: fresh.length };
}

// ---------------------------------------------------------------------------
// Vocabulary lists — learner-curated ordered collections ("Common French
// verbs"). Created from the table's current filter/sort view, then
// managed item-by-item: add, remove, reorder.
// ---------------------------------------------------------------------------

const listNameSchema = z.string().trim().min(1).max(80);

/** Append slot at the end of a book — max(position) + 1. */
async function nextListPosition(listId: string): Promise<number> {
  const [{ max }] = await db
    .select({
      max: sql<number>`coalesce(max(${studyVocabListItems.position}), -1)`,
    })
    .from(studyVocabListItems)
    .where(eq(studyVocabListItems.listId, listId));
  return Number(max) + 1;
}

/** The learner's list, or throw — every list mutation goes through this. */
async function requireOwnList(learnerId: string, listId: string) {
  const id = z.string().uuid().parse(listId);
  const list = await db.query.studyVocabLists.findFirst({
    where: and(
      eq(studyVocabLists.id, id),
      eq(studyVocabLists.learnerId, learnerId),
    ),
  });
  if (!list) throw new Error("List not found");
  return list;
}

/**
 * Create a book — empty ("New book" on the shelf) or from an ordered
 * set of the learner's own words (the table's current view). Rows that
 * aren't the learner's are dropped server-side, not trusted from the
 * client.
 */
export async function createStudyVocabList(name: string, vocabIds: string[]) {
  const learner = await requireLearner();
  const parsedName = listNameSchema.parse(name);
  const ids = z.array(z.string().uuid()).max(500).parse(vocabIds);

  const owned = await db
    .select({ id: studyVocab.id })
    .from(studyVocab)
    .where(eq(studyVocab.learnerId, learner.id));
  const ownedIds = new Set(owned.map((r) => r.id));
  const kept = [...new Set(ids)].filter((id) => ownedIds.has(id));

  const [list] = await db
    .insert(studyVocabLists)
    .values({ learnerId: learner.id, name: parsedName })
    .returning({ id: studyVocabLists.id });

  if (kept.length > 0) {
    await db.insert(studyVocabListItems).values(
      kept.map((vocabId, position) => ({ listId: list.id, vocabId, position })),
    );
  }

  revalidateStudyTree();
  revalidatePath("/vocab");
  return { id: list.id, count: kept.length };
}

/** Pinned books ride in the sidebar (open + quick-add), ChatGPT-style. */
export async function toggleStudyVocabListPin(listId: string) {
  const learner = await requireLearner();
  const list = await requireOwnList(learner.id, listId);

  await db
    .update(studyVocabLists)
    .set({ pinned: !list.pinned, updatedAt: new Date() })
    .where(eq(studyVocabLists.id, list.id));

  revalidateStudyTree();
  revalidatePath("/vocab");
}

/**
 * The DEFAULT book — where a one-tap save files the word, on top of it
 * joining the vocabulary. Spotify's shape: the heart is the library, the
 * default book is the playlist you're currently building, so collecting
 * from an official book is one tap instead of two.
 *
 * Clearing first then setting is what keeps the partial unique index
 * (`study_vocab_lists_one_default_idx`) satisfiable — the DB, not this
 * function, is what guarantees a learner never ends up with two.
 */
export async function setDefaultStudyVocabList(
  listId: string,
  isDefault: boolean,
) {
  const learner = await requireLearner();
  const list = await requireOwnList(learner.id, listId);

  await db.transaction(async (tx) => {
    await tx
      .update(studyVocabLists)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(studyVocabLists.learnerId, learner.id),
          eq(studyVocabLists.isDefault, true),
        ),
      );
    if (isDefault) {
      await tx
        .update(studyVocabLists)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(studyVocabLists.id, list.id));
    }
  });

  revalidateStudyTree();
  revalidatePath("/vocab");
  revalidatePath("/packs");
}

const bookWordSchema = z.object({
  language: languageSchema,
  term: z.string().trim().min(1).max(200),
  reading: z.string().trim().max(200).optional(),
  meaning: z.string().trim().max(500).optional(),
  category: z.enum(STUDY_VOCAB_CATEGORIES).optional(),
});

/**
 * The pinned-book quick-add: save a word (or adopt the already-saved
 * one) and file it at the end of the book, in one tap from anywhere.
 */
export async function addStudyVocabToBook(listId: string, formData: FormData) {
  const learner = await requireLearner();
  const list = await requireOwnList(learner.id, listId);
  const parsed = bookWordSchema.parse({
    language: formData.get("language"),
    term: formData.get("term"),
    reading: formData.get("reading") || undefined,
    meaning: formData.get("meaning") || undefined,
    category: formData.get("category") || undefined,
  });

  let word = await db.query.studyVocab.findFirst({
    where: and(
      eq(studyVocab.learnerId, learner.id),
      eq(studyVocab.language, parsed.language),
      sql`lower(${studyVocab.term}) = lower(${parsed.term})`,
    ),
    columns: { id: true },
  });
  if (!word) {
    [word] = await db
      .insert(studyVocab)
      .values({
        learnerId: learner.id,
        language: parsed.language,
        term: parsed.term,
        reading: parsed.reading || null,
        meaning: parsed.meaning || null,
        category: parsed.category ?? null,
      })
      .returning({ id: studyVocab.id });
  }

  await db
    .insert(studyVocabListItems)
    .values({
      listId: list.id,
      vocabId: word.id,
      position: await nextListPosition(list.id),
    })
    .onConflictDoNothing();

  revalidateStudyTree();
  revalidatePath("/vocab");
}

export async function renameStudyVocabList(listId: string, name: string) {
  const learner = await requireLearner();
  const parsedName = listNameSchema.parse(name);
  const list = await requireOwnList(learner.id, listId);

  await db
    .update(studyVocabLists)
    .set({ name: parsedName, updatedAt: new Date() })
    .where(eq(studyVocabLists.id, list.id));

  revalidateStudyTree();
  revalidatePath("/vocab");
}

export async function deleteStudyVocabList(listId: string) {
  const learner = await requireLearner();
  const list = await requireOwnList(learner.id, listId);

  await db.delete(studyVocabLists).where(eq(studyVocabLists.id, list.id));

  revalidateStudyTree();
  revalidatePath("/vocab");
}

export async function addToStudyVocabList(listId: string, vocabId: string) {
  const learner = await requireLearner();
  const list = await requireOwnList(learner.id, listId);
  const id = z.string().uuid().parse(vocabId);

  const word = await db.query.studyVocab.findFirst({
    where: and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)),
    columns: { id: true },
  });
  if (!word) throw new Error("Word not found");

  await db
    .insert(studyVocabListItems)
    .values({
      listId: list.id,
      vocabId: id,
      position: await nextListPosition(list.id),
    })
    .onConflictDoNothing(); // already on the list = no-op

  revalidatePath("/vocab");
}

export async function removeFromStudyVocabList(
  listId: string,
  vocabId: string,
) {
  const learner = await requireLearner();
  const list = await requireOwnList(learner.id, listId);
  const id = z.string().uuid().parse(vocabId);

  await db
    .delete(studyVocabListItems)
    .where(
      and(
        eq(studyVocabListItems.listId, list.id),
        eq(studyVocabListItems.vocabId, id),
      ),
    );

  revalidatePath("/vocab");
}

/** Drag-reorder: move the word to an arbitrary index; positions are
 * rewritten contiguously so the book's order is always 0..n-1. */
export async function reorderStudyVocabListItem(
  listId: string,
  vocabId: string,
  toIndex: number,
) {
  const learner = await requireLearner();
  const list = await requireOwnList(learner.id, listId);
  const id = z.string().uuid().parse(vocabId);
  const target = z.number().int().min(0).max(10_000).parse(toIndex);

  const items = await db
    .select({ id: studyVocabListItems.id, vocabId: studyVocabListItems.vocabId })
    .from(studyVocabListItems)
    .where(eq(studyVocabListItems.listId, list.id))
    .orderBy(asc(studyVocabListItems.position));

  const from = items.findIndex((i) => i.vocabId === id);
  if (from === -1) throw new Error("Word is not on this list");
  const [moved] = items.splice(from, 1);
  items.splice(Math.min(target, items.length), 0, moved);

  // One update per shifted row, atomically — a crash mid-rewrite must
  // not leave duplicate positions.
  await db.transaction(async (tx) => {
    for (const [position, item] of items.entries()) {
      await tx
        .update(studyVocabListItems)
        .set({ position })
        .where(eq(studyVocabListItems.id, item.id));
    }
  });

  revalidatePath("/vocab");
}

// ---------------------------------------------------------------------------
// Curated packs — read-only shipped content; these actions COPY pack
// items into the learner's own vocabulary (dedup per language by term).
// ---------------------------------------------------------------------------

/**
 * Copy ONE pack item into the learner's vocabulary, optionally filing it
 * into a book at the same time.
 *
 * The vocabulary is the "liked songs" layer and books are playlists: a
 * word lives in the vocabulary once and appears in any number of books.
 * So an already-saved word is NOT a no-op when a book is named — it was
 * possibly added from another pack or by hand, and filing it still has
 * to work. Only the vocabulary insert is conditional.
 */
export async function addStudyPackItem(
  itemId: string,
  target?: { listId?: string; newListName?: string },
): Promise<{
  added: boolean;
  vocabId: string;
  listId: string | null;
  listName: string | null;
}> {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(itemId);

  const [row] = await db
    .select({ item: studyPackItems, language: studyPacks.language })
    .from(studyPackItems)
    .innerJoin(studyPacks, eq(studyPackItems.packId, studyPacks.id))
    .where(eq(studyPackItems.id, id));
  if (!row) throw new Error("Pack item not found");

  // Same dedup key the pack page's ✓ is computed from: language + the
  // lowercased term.
  const existing = await db
    .select({ id: studyVocab.id })
    .from(studyVocab)
    .where(
      and(
        eq(studyVocab.learnerId, learner.id),
        eq(studyVocab.language, row.language),
        sql`lower(${studyVocab.term}) = ${row.item.term.toLowerCase()}`,
      ),
    )
    .limit(1);

  let vocabId = existing[0]?.id;
  const added = !vocabId;
  if (!vocabId) {
    const [created] = await db
      .insert(studyVocab)
      .values({
        learnerId: learner.id,
        language: row.language,
        term: row.item.term,
        reading: row.item.reading,
        meaning: row.item.meaning,
        example: row.item.example,
        category: row.item.category,
      })
      .returning({ id: studyVocab.id });
    vocabId = created.id;
  }

  let listId: string | null = null;
  let listName: string | null = null;
  // No explicit target = the one-tap save. It always joins the
  // vocabulary; it ALSO files into the learner's default book when they
  // have set one, which is the whole point of having a default.
  if (target === undefined) {
    const fallback = await db.query.studyVocabLists.findFirst({
      where: and(
        eq(studyVocabLists.learnerId, learner.id),
        eq(studyVocabLists.isDefault, true),
      ),
      columns: { id: true, name: true },
    });
    if (fallback) target = { listId: fallback.id };
  }
  if (target?.newListName !== undefined) {
    const name = z.string().trim().min(1).max(120).parse(target.newListName);
    const [list] = await db
      .insert(studyVocabLists)
      .values({ learnerId: learner.id, name })
      .returning();
    await db.insert(studyVocabListItems).values({
      listId: list.id,
      vocabId,
      position: await nextListPosition(list.id),
    });
    listId = list.id;
    listName = list.name;
  } else if (target?.listId) {
    const list = await requireOwnList(learner.id, target.listId);
    await db
      .insert(studyVocabListItems)
      .values({
        listId: list.id,
        vocabId,
        position: await nextListPosition(list.id),
      })
      .onConflictDoNothing(); // already filed here = no-op
    listId = list.id;
    listName = list.name;
  }

  revalidatePath("/vocab");
  return { added, vocabId, listId, listName };
}

/**
 * Copy the WHOLE pack: every not-yet-saved item joins the learner's
 * vocabulary, and a personal list named after the pack is created (or
 * refreshed) carrying the pack's curated order. The learner's list is
 * theirs afterwards — reorder, prune, extend freely.
 */
export async function importStudyPack(packId: string): Promise<{
  added: number;
  list: string;
  listId: string;
  /** Lowercased term → the learner's own vocab row id, so the pack page
   * can refresh its saved-state without a reload. */
  vocabIdsByTerm: Record<string, string>;
}> {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(packId);

  const pack = await db.query.studyPacks.findFirst({
    where: eq(studyPacks.id, id),
  });
  if (!pack) throw new Error("Pack not found");
  const items = await db
    .select()
    .from(studyPackItems)
    .where(eq(studyPackItems.packId, pack.id))
    .orderBy(asc(studyPackItems.position));

  const saved = await savedTermsFor(learner.id, pack.language);
  const fresh = items.filter((i) => !saved.has(i.term.toLowerCase()));
  if (fresh.length > 0) {
    await db.insert(studyVocab).values(
      fresh.map((item) => ({
        learnerId: learner.id,
        language: pack.language,
        term: item.term,
        reading: item.reading,
        meaning: item.meaning,
        example: item.example,
        category: item.category,
      })),
    );
  }

  // The learner's copy of the pack as a list, in pack order.
  const vocabRows = await db
    .select({ id: studyVocab.id, term: studyVocab.term })
    .from(studyVocab)
    .where(
      and(
        eq(studyVocab.learnerId, learner.id),
        eq(studyVocab.language, pack.language),
      ),
    );
  const byTerm = new Map(vocabRows.map((r) => [r.term.toLowerCase(), r.id]));
  const orderedIds = items
    .map((i) => byTerm.get(i.term.toLowerCase()))
    .filter((v): v is string => !!v);

  let list = await db.query.studyVocabLists.findFirst({
    where: and(
      eq(studyVocabLists.learnerId, learner.id),
      eq(studyVocabLists.name, pack.name),
    ),
  });
  if (!list) {
    [list] = await db
      .insert(studyVocabLists)
      .values({ learnerId: learner.id, name: pack.name })
      .returning();
  } else {
    await db
      .delete(studyVocabListItems)
      .where(eq(studyVocabListItems.listId, list.id));
  }
  await db.insert(studyVocabListItems).values(
    orderedIds.map((vocabId, position) => ({
      listId: list.id,
      vocabId,
      position,
    })),
  );

  revalidatePath("/vocab");
  // The pack page keeps its saved-state in React state, so hand back the
  // ids it needs to reflect the import without a reload (a reload would
  // also throw away the confirmation banner it just earned).
  return {
    added: fresh.length,
    list: pack.name,
    listId: list.id,
    vocabIdsByTerm: Object.fromEntries(
      items
        .map((i) => [i.term.toLowerCase(), byTerm.get(i.term.toLowerCase())])
        .filter((pair): pair is [string, string] => !!pair[1]),
    ),
  };
}

const gradeSchema = z.enum(["again", "hard", "good", "easy"]);

/**
 * Flashcard review — same SM-2-lite engine and evidence-derived status
 * pipeline as the roster vocabulary (src/lib/srs.ts).
 */
export async function reviewStudyVocab(
  vocabId: string,
  grade: "again" | "hard" | "good" | "easy",
) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(vocabId);
  const parsedGrade = gradeSchema.parse(grade);

  const item = await db.query.studyVocab.findFirst({
    where: and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)),
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

  await db
    .update(studyVocab)
    .set({ ...patch, updatedAt: now })
    .where(and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)));

  // Deliberately NOT revalidating /vocab/review: the review page
  // hands the client a session snapshot of the due deck, and refreshing
  // it mid-session yanks cards out from under the learner (and re-queues
  // "again" cards early). A fresh visit re-queries anyway.
  revalidatePath("/vocab");
}

// ---------------------------------------------------------------------------
// Billing — Stripe Checkout + customer portal. Throws loudly when Stripe
// is not configured; the account page only renders these buttons when
// billingConfigured() is true.
// ---------------------------------------------------------------------------

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3020";

export async function startStudyCheckout() {
  const learner = await requireLearner();
  if (!billingConfigured()) {
    throw new Error(
      "Billing is not configured — set the STRIPE_* environment variables.",
    );
  }
  const stripe = getStripe();

  let customerId = learner.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: learner.email,
      name: learner.name ?? undefined,
      metadata: { learnerId: learner.id },
    });
    customerId = customer.id;
    await db
      .update(learners)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(learners.id, learner.id));
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: studyPriceId(), quantity: 1 }],
    success_url: `${APP_URL}/account?checkout=success`,
    cancel_url: `${APP_URL}/account?checkout=canceled`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");

  redirect(session.url);
}

export async function openStudyBillingPortal() {
  const learner = await requireLearner();
  if (!billingConfigured()) {
    throw new Error(
      "Billing is not configured — set the STRIPE_* environment variables.",
    );
  }
  if (!learner.stripeCustomerId) {
    throw new Error("No Stripe customer for this learner yet.");
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: learner.stripeCustomerId,
    return_url: `${APP_URL}/account`,
  });

  redirect(session.url);
}
