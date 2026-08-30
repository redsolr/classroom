"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  studyMessages,
  studyProjects,
  studyThreads,
  studyVocab,
  studyDeckItems,
} from "@/db";
import { STUDY_VOCAB_CATEGORIES } from "@/lib/study-vocab-categories";
import {
  extractVocabCandidates,
  vocabCandidateSchema,
  type VocabCandidate,
} from "@/lib/ai/vocab-extract";
import { requireLearner } from "@/lib/auth";
import { languageSchema } from "@/lib/study-decks";
import { dailyCapFor } from "@/lib/billing";
import type { ReviewGrade } from "@/lib/srs";
import { gradeOwnedCard } from "@/lib/srs-review";
import { requireOwnDeck } from "@/lib/study-guards";
import { countTutorMessagesLast24h } from "@/lib/study-usage";

/**
 * Words — the learner's own vocabulary: adding, editing, deleting,
 * grading, pulling a practice deck, and extracting words out of a
 * conversation. Sentence cards keep their own file (`sentences.ts`):
 * the two card types share a scheduler and nothing else.
 */

/**
 * A shuffled cram deck over the learner's whole vocabulary — the
 * "practice again" round after (or instead of) the due deck. Anki
 * convention: practicing NEVER reschedules; the SRS state stays
 * derived from real due reviews only, so the caller must not grade
 * these through reviewStudyVocab.
 */
export async function loadStudyPracticeDeck(deckId?: string | null) {
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
  if (deckId) {
    const list = await requireOwnDeck(learner.id, deckId);
    return db
      .select(columns)
      .from(studyVocab)
      .innerJoin(
        studyDeckItems,
        eq(studyDeckItems.vocabId, studyVocab.id),
      )
      .where(
        and(
          eq(studyVocab.learnerId, learner.id),
          eq(studyDeckItems.deckId, list.id),
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

  revalidatePath("/books");
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

  revalidatePath("/books");
}

export async function deleteStudyVocab(vocabId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(vocabId);

  await db
    .delete(studyVocab)
    .where(and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)));

  revalidatePath("/books");
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

// `savedTermsFor` moved to packs.ts with the split — importing a pack
// is its only caller, and a helper's home is where it is used.

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
    revalidatePath("/books");
  }

  return { added: fresh.length };
}

/**
 * Flashcard review — same SM-2-lite engine and evidence-derived status
 * pipeline as the roster vocabulary (src/lib/srs.ts).
 */
export async function reviewStudyVocab(vocabId: string, grade: ReviewGrade) {
  const learner = await requireLearner();
  await gradeOwnedCard(
    studyVocab,
    learner.id,
    vocabId,
    grade,
    "Vocabulary item not found",
  );

  // Deliberately NOT revalidating /decks: the review page
  // hands the client a session snapshot of the due deck, and refreshing
  // it mid-session yanks cards out from under the learner (and re-queues
  // "again" cards early). A fresh visit re-queries anyway.
  revalidatePath("/books");
}
