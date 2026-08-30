"use server";

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
import { revalidateDeck } from "@/lib/study-revalidate";

/**
 * DECKS — the ordered word list you actually drill.
 *
 * Creating, renaming, pinning, the default deck, membership and manual
 * order. A deck is the small unit; a BOOK is what holds several of them
 * (`actions/books.ts`), and filing one into the other is `moveDeckToBook`
 * over there, because that is a fact about the container.
 *
 * The file said "books" throughout until 2026-08-30, from back when a
 * deck was called one. The names left in a rename are the ones that make
 * the next reader open the wrong table.
 */

const deckNameSchema = z.string().trim().min(1).max(80);

/**
 * Create a deck — empty ("New deck") or from an ordered set of the
 * learner's own words (the table's current view). Rows that aren't the
 * learner's are dropped server-side, not trusted from the client.
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

  const [deck] = await db
    .insert(studyDecks)
    .values({ learnerId: learner.id, name: parsedName })
    .returning({ id: studyDecks.id });

  if (kept.length > 0) {
    await db.insert(studyDeckItems).values(
      kept.map((vocabId, position) => ({ deckId: deck.id, vocabId, position })),
    );
  }

  revalidateDeck(deck.id);
  return { id: deck.id, count: kept.length };
}

/** Pinned decks ride in the sidebar (open + quick-add), ChatGPT-style. */
export async function toggleStudyDeckPin(deckId: string) {
  const learner = await requireLearner();
  const deck = await requireOwnDeck(learner.id, deckId);

  await db
    .update(studyDecks)
    .set({ pinned: !deck.pinned, updatedAt: new Date() })
    .where(eq(studyDecks.id, deck.id));

  revalidateDeck(deck.id);
}

/**
 * The DEFAULT deck — where a one-tap save files the word, on top of it
 * joining the vocabulary. Spotify's shape: the heart is the library, the
 * default deck is the playlist you're currently building, so collecting
 * from an official book is one tap instead of two.
 *
 * Clearing first then setting is what keeps the partial unique index
 * (`study_decks_one_default_idx`) satisfiable — the DB, not this
 * function, is what guarantees a learner never ends up with two.
 */
export async function setDefaultStudyDeck(
  deckId: string,
  isDefault: boolean,
) {
  const learner = await requireLearner();
  const deck = await requireOwnDeck(learner.id, deckId);

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
        .where(eq(studyDecks.id, deck.id));
    }
  });

  revalidateDeck(deck.id);
}

const deckWordSchema = z.object({
  language: languageSchema,
  term: z.string().trim().min(1).max(200),
  reading: z.string().trim().max(200).optional(),
  meaning: z.string().trim().max(500).optional(),
  category: z.enum(STUDY_VOCAB_CATEGORIES).optional(),
});

/**
 * The pinned-deck quick-add: save a word (or adopt the already-saved
 * one) and file it at the end of the deck, in one tap from anywhere.
 */
export async function addStudyVocabToDeck(deckId: string, formData: FormData) {
  const learner = await requireLearner();
  const deck = await requireOwnDeck(learner.id, deckId);
  const parsed = deckWordSchema.parse({
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
      deckId: deck.id,
      vocabId: word.id,
      position: await nextDeckPosition(deck.id),
    })
    .onConflictDoNothing();

  revalidateDeck(deck.id);
}

export async function renameStudyDeck(deckId: string, name: string) {
  const learner = await requireLearner();
  const parsedName = deckNameSchema.parse(name);
  const deck = await requireOwnDeck(learner.id, deckId);

  await db
    .update(studyDecks)
    .set({ name: parsedName, updatedAt: new Date() })
    .where(eq(studyDecks.id, deck.id));

  revalidateDeck(deck.id);
}

export async function deleteStudyDeck(deckId: string) {
  const learner = await requireLearner();
  const deck = await requireOwnDeck(learner.id, deckId);

  await db.delete(studyDecks).where(eq(studyDecks.id, deck.id));

  revalidateDeck(deck.id);
}

export async function addToStudyDeck(deckId: string, vocabId: string) {
  const learner = await requireLearner();
  const deck = await requireOwnDeck(learner.id, deckId);
  const id = z.string().uuid().parse(vocabId);

  const word = await db.query.studyVocab.findFirst({
    where: and(eq(studyVocab.id, id), eq(studyVocab.learnerId, learner.id)),
    columns: { id: true },
  });
  if (!word) throw new Error("Word not found");

  await db
    .insert(studyDeckItems)
    .values({
      deckId: deck.id,
      vocabId: id,
      position: await nextDeckPosition(deck.id),
    })
    .onConflictDoNothing(); // already in the deck = no-op

  revalidateDeck(deck.id);
}

export async function removeFromStudyDeck(
  deckId: string,
  vocabId: string,
) {
  const learner = await requireLearner();
  const deck = await requireOwnDeck(learner.id, deckId);
  const id = z.string().uuid().parse(vocabId);

  await db
    .delete(studyDeckItems)
    .where(
      and(
        eq(studyDeckItems.deckId, deck.id),
        eq(studyDeckItems.vocabId, id),
      ),
    );

  revalidateDeck(deck.id);
}

/** Drag-reorder: move the word to an arbitrary index; positions are
 * rewritten contiguously so the deck's order is always 0..n-1. */
export async function reorderStudyDeckItem(
  deckId: string,
  vocabId: string,
  toIndex: number,
) {
  const learner = await requireLearner();
  const deck = await requireOwnDeck(learner.id, deckId);
  const id = z.string().uuid().parse(vocabId);
  const target = z.number().int().min(0).max(10_000).parse(toIndex);

  const items = await db
    .select({ id: studyDeckItems.id, vocabId: studyDeckItems.vocabId })
    .from(studyDeckItems)
    .where(eq(studyDeckItems.deckId, deck.id))
    .orderBy(asc(studyDeckItems.position));

  const from = items.findIndex((i) => i.vocabId === id);
  if (from === -1) throw new Error("Word is not in this deck");
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

  revalidateDeck(deck.id);
}
