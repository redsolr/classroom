import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, studyDeckItems, studyVocab } from "@/db";

/**
 * Shared pieces the study ACTIONS and deck-building queries need but
 * cannot own between them.
 *
 * These were private to the old monolithic `study.ts`, where "shared"
 * cost nothing because everything lived in one file. The split turned
 * each into a genuine cross-module dependency — `languageSchema` is used
 * by threads, words and decks; `nextDeckPosition` by decks and by
 * importing an official pack — and the only two ways to handle that are
 * a shared home or a copy per file. A copy is how two validators drift
 * until one accepts a language the other rejects.
 *
 * They live OUTSIDE `src/lib/actions/` deliberately: everything exported
 * from there is compiled into a public POST endpoint, so a helper placed
 * in that directory would become callable on its own and would trip the
 * auth ratchet for not resolving a caller it was never meant to.
 */

/** A language name as the UI offers it — not an ISO code, on purpose:
 * the roster is human-readable ("Japanese"), and words carry it. */
export const languageSchema = z.string().trim().min(2).max(40);

/**
 * The columns a drill card is built from — the select-list twin of
 * `WordCard` in `study-cards.ts`.
 *
 * Every deck the review screen deals goes through `toWordCards()`, and
 * each caller was spelling these six columns out again. They are a
 * CONTRACT with the card type, not a local choice: adding a field to
 * `WordCard` and missing one select list is a card that renders blank on
 * exactly one surface. It lives here rather than beside the type because
 * `study-cards.ts` is imported by the client drill component, and drizzle
 * column references have no business in that bundle.
 */
export const wordCardColumns = {
  id: studyVocab.id,
  language: studyVocab.language,
  term: studyVocab.term,
  reading: studyVocab.reading,
  meaning: studyVocab.meaning,
  example: studyVocab.example,
};

/** Append slot at the end of a deck — max(position) + 1. */
export async function nextDeckPosition(deckId: string): Promise<number> {
  const [{ max }] = await db
    .select({
      max: sql<number>`coalesce(max(${studyDeckItems.position}), -1)`,
    })
    .from(studyDeckItems)
    .where(eq(studyDeckItems.deckId, deckId));
  return Number(max) + 1;
}
