"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  studyVocab,
  studyDeckItems,
  studyDecks,
} from "@/db";
import { STUDY_VOCAB_CATEGORIES } from "@/lib/study-vocab-categories";
import { requireLearner } from "@/lib/auth";
import {
  languageSchema,
  nextDeckPosition,
} from "@/lib/study-decks";
import { requireOwnDeck } from "@/lib/study-guards";
import { revalidateStudyTree } from "@/lib/study-revalidate";

/**
 * Books — the learner's own collections of words: creating, renaming,
 * pinning, the default book, membership and manual order.
 */

// ---------------------------------------------------------------------------
// Vocabulary lists — learner-curated ordered collections ("Common French
// verbs"). Created from the table's current filter/sort view, then
// managed item-by-item: add, remove, reorder.
// ---------------------------------------------------------------------------

const deckNameSchema = z.string().trim().min(1).max(80);

/** The learner's list, or throw — every list mutation goes through this. */
/**
 * Create a book — empty ("New book" on the shelf) or from an ordered
 * set of the learner's own words (the table's current view). Rows that
 * aren't the learner's are dropped server-side, not trusted from the
 * client.
 */
export async function createStudyDeck(name: string, vocabIds: string[]) {
  const learner = await requireLearner();
  const parsedName = deckNameSchema.parse(name);
  const ids = z.array(z.string().uuid()).max(500).parse(vocabIds);

  const owned = await db
    .select({ id: studyVocab.id })
    .from(studyVocab)
    .where(eq(studyVocab.learnerId, learner.id));
  const ownedIds = new Set(owned.map((r) => r.id));
  const kept = [...new Set(ids)].filter((id) => ownedIds.has(id));

  const [list] = await db
    .insert(studyDecks)
    .values({ learnerId: learner.id, name: parsedName })
    .returning({ id: studyDecks.id });

  if (kept.length > 0) {
    await db.insert(studyDeckItems).values(
      kept.map((vocabId, position) => ({ deckId: list.id, vocabId, position })),
    );
  }

  revalidateStudyTree();
  revalidatePath("/books");
  return { id: list.id, count: kept.length };
}

/** Pinned books ride in the sidebar (open + quick-add), ChatGPT-style. */
export async function toggleStudyDeckPin(deckId: string) {
  const learner = await requireLearner();
  const list = await requireOwnDeck(learner.id, deckId);

  await db
    .update(studyDecks)
    .set({ pinned: !list.pinned, updatedAt: new Date() })
    .where(eq(studyDecks.id, list.id));

  revalidateStudyTree();
  revalidatePath("/books");
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
export async function setDefaultStudyDeck(
  deckId: string,
  isDefault: boolean,
) {
  const learner = await requireLearner();
  const list = await requireOwnDeck(learner.id, deckId);

  await db.transaction(async (tx) => {
    await tx
      .update(studyDecks)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(studyDecks.learnerId, learner.id),
          eq(studyDecks.isDefault, true),
        ),
      );
    if (isDefault) {
      await tx
        .update(studyDecks)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(studyDecks.id, list.id));
    }
  });

  revalidateStudyTree();
  revalidatePath("/books");
  revalidatePath("/official");
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
export async function addStudyVocabToDeck(deckId: string, formData: FormData) {
  const learner = await requireLearner();
  const list = await requireOwnDeck(learner.id, deckId);
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
    .insert(studyDeckItems)
    .values({
      deckId: list.id,
      vocabId: word.id,
      position: await nextDeckPosition(list.id),
    })
    .onConflictDoNothing();

  revalidateStudyTree();
  revalidatePath("/books");
}

export async function renameStudyDeck(deckId: string, name: string) {
  const learner = await requireLearner();
  const parsedName = deckNameSchema.parse(name);
  const list = await requireOwnDeck(learner.id, deckId);

  await db
    .update(studyDecks)
    .set({ name: parsedName, updatedAt: new Date() })
    .where(eq(studyDecks.id, list.id));

  revalidateStudyTree();
  revalidatePath("/books");
}

export async function deleteStudyDeck(deckId: string) {
  const learner = await requireLearner();
  const list = await requireOwnDeck(learner.id, deckId);

  await db.delete(studyDecks).where(eq(studyDecks.id, list.id));

  revalidateStudyTree();
  revalidatePath("/books");
}

export async function addToStudyDeck(deckId: string, vocabId: string) {
  const learner = await requireLearner();
  const list = await requireOwnDeck(learner.id, deckId);
  const id = z.string().uuid().parse(vocabId);

  const word = await db.query.studyVocab.findFirst({
    where: and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)),
    columns: { id: true },
  });
  if (!word) throw new Error("Word not found");

  await db
    .insert(studyDeckItems)
    .values({
      deckId: list.id,
      vocabId: id,
      position: await nextDeckPosition(list.id),
    })
    .onConflictDoNothing(); // already on the list = no-op

  revalidatePath("/books");
}

export async function removeFromStudyDeck(
  deckId: string,
  vocabId: string,
) {
  const learner = await requireLearner();
  const list = await requireOwnDeck(learner.id, deckId);
  const id = z.string().uuid().parse(vocabId);

  await db
    .delete(studyDeckItems)
    .where(
      and(
        eq(studyDeckItems.deckId, list.id),
        eq(studyDeckItems.vocabId, id),
      ),
    );

  revalidatePath("/books");
}

/** Drag-reorder: move the word to an arbitrary index; positions are
 * rewritten contiguously so the book's order is always 0..n-1. */
export async function reorderStudyDeckItem(
  deckId: string,
  vocabId: string,
  toIndex: number,
) {
  const learner = await requireLearner();
  const list = await requireOwnDeck(learner.id, deckId);
  const id = z.string().uuid().parse(vocabId);
  const target = z.number().int().min(0).max(10_000).parse(toIndex);

  const items = await db
    .select({ id: studyDeckItems.id, vocabId: studyDeckItems.vocabId })
    .from(studyDeckItems)
    .where(eq(studyDeckItems.deckId, list.id))
    .orderBy(asc(studyDeckItems.position));

  const from = items.findIndex((i) => i.vocabId === id);
  if (from === -1) throw new Error("Word is not on this list");
  const [moved] = items.splice(from, 1);
  items.splice(Math.min(target, items.length), 0, moved);

  // One update per shifted row, atomically — a crash mid-rewrite must
  // not leave duplicate positions.
  await db.transaction(async (tx) => {
    for (const [position, item] of items.entries()) {
      await tx
        .update(studyDeckItems)
        .set({ position })
        .where(eq(studyDeckItems.id, item.id));
    }
  });

  revalidatePath("/books");
}
