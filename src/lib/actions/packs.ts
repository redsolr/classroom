"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  studyPackItems,
  studyPacks,
  studyVocab,
  studyDeckItems,
  studyDecks,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { nextDeckPosition } from "@/lib/study-decks";
import { requireOwnDeck } from "@/lib/study-guards";

/**
 * Official books — copying our shipped content into a learner's own
 * vocabulary, one word or a whole pack at a time.
 */

/** The learner's saved terms in a language, lowercased for dedup. It
 * lived in the old `study.ts` next to the extraction helpers; importing
 * a pack is its only caller, and a helper's home is where it's used. */
async function savedTermsFor(learnerId: string, language: string) {
  const rows = await db
    .select({ term: studyVocab.term })
    .from(studyVocab)
    .where(
      and(eq(studyVocab.learnerId, learnerId), eq(studyVocab.language, language)),
    );
  return new Set(rows.map((r) => r.term.toLowerCase()));
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
  target?: { deckId?: string; newListName?: string },
): Promise<{
  added: boolean;
  vocabId: string;
  deckId: string | null;
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

  let deckId: string | null = null;
  let listName: string | null = null;
  // No explicit target = the one-tap save. It always joins the
  // vocabulary; it ALSO files into the learner's default book when they
  // have set one, which is the whole point of having a default.
  if (target === undefined) {
    const fallback = await db.query.studyDecks.findFirst({
      where: and(
        eq(studyDecks.learnerId, learner.id),
        eq(studyDecks.isDefault, true),
      ),
      columns: { id: true, name: true },
    });
    if (fallback) target = { deckId: fallback.id };
  }
  if (target?.newListName !== undefined) {
    const name = z.string().trim().min(1).max(120).parse(target.newListName);
    const [list] = await db
      .insert(studyDecks)
      .values({ learnerId: learner.id, name })
      .returning();
    await db.insert(studyDeckItems).values({
      deckId: list.id,
      vocabId,
      position: await nextDeckPosition(list.id),
    });
    deckId = list.id;
    listName = list.name;
  } else if (target?.deckId) {
    const list = await requireOwnDeck(learner.id, target.deckId);
    await db
      .insert(studyDeckItems)
      .values({
        deckId: list.id,
        vocabId,
        position: await nextDeckPosition(list.id),
      })
      .onConflictDoNothing(); // already filed here = no-op
    deckId = list.id;
    listName = list.name;
  }

  revalidatePath("/books");
  return { added, vocabId, deckId, listName };
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
  deckId: string;
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

  let list = await db.query.studyDecks.findFirst({
    where: and(
      eq(studyDecks.learnerId, learner.id),
      eq(studyDecks.name, pack.name),
    ),
  });
  if (!list) {
    [list] = await db
      .insert(studyDecks)
      .values({ learnerId: learner.id, name: pack.name })
      .returning();
  } else {
    await db
      .delete(studyDeckItems)
      .where(eq(studyDeckItems.deckId, list.id));
  }
  await db.insert(studyDeckItems).values(
    orderedIds.map((vocabId, position) => ({
      deckId: list.id,
      vocabId,
      position,
    })),
  );

  revalidatePath("/books");
  // The pack page keeps its saved-state in React state, so hand back the
  // ids it needs to reflect the import without a reload (a reload would
  // also throw away the confirmation banner it just earned).
  return {
    added: fresh.length,
    list: pack.name,
    deckId: list.id,
    vocabIdsByTerm: Object.fromEntries(
      items
        .map((i) => [i.term.toLowerCase(), byTerm.get(i.term.toLowerCase())])
        .filter((pair): pair is [string, string] => !!pair[1]),
    ),
  };
}
