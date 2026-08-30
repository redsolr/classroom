import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, studyDeckItems, studyReviews, studyVocab } from "@/db";
import { wordCardColumns } from "@/lib/study-decks";

/**
 * THE ERROR DECK — only the ones you got wrong.
 *
 * The single highest-value drill there is, and the one Anki makes you
 * build a filtered deck by hand for. A due deck is mostly cards you
 * already know arriving on schedule; the cards you actually failed are
 * scattered through it, and they are the only ones where a repetition
 * changes anything.
 *
 * ── What counts as an error ────────────────────────────────────────
 *
 * A card whose MOST RECENT answer was "again", within the window. Two
 * choices in that sentence, both deliberate:
 *
 *   most recent — a card you failed last month and have since got right
 *                 three times is not a problem any more, and keeping it
 *                 in the error deck would mean the deck never empties,
 *                 which is the fastest way to make a learner stop
 *                 opening it.
 *
 *   within a window — a card failed once a year ago and never seen since
 *                 is not a live error either; it is just a card. The
 *                 window keeps this surface about recent trouble.
 *
 * This is why the review LOG had to exist. The card row knows its
 * schedule; only `study_reviews` knows what you actually answered.
 */

/** How far back an error still counts as one. */
const ERROR_WINDOW_DAYS = 30;

/** A drill is a drill — no point dealing 200 cards nobody will finish. */
const MAX_ERROR_CARDS = 40;

export async function loadErrorDeck(
  learnerId: string,
  deckId?: string | null,
): Promise<
  {
    id: string;
    language: string;
    term: string;
    reading: string | null;
    meaning: string | null;
    example: string | null;
  }[]
> {
  const since = new Date();
  since.setDate(since.getDate() - ERROR_WINDOW_DAYS);

  // Every graded answer in the window, newest first, so the first row
  // seen per card IS that card's most recent answer.
  const recent = await db
    .select({
      vocabId: studyReviews.vocabId,
      grade: studyReviews.grade,
    })
    .from(studyReviews)
    .where(
      and(
        eq(studyReviews.learnerId, learnerId),
        eq(studyReviews.kind, "word"),
        gte(studyReviews.reviewedAt, since),
      ),
    )
    .orderBy(desc(studyReviews.reviewedAt));

  const latest = new Map<string, string>();
  for (const row of recent) {
    if (!row.vocabId) continue; // the card was deleted; the row remains
    if (!latest.has(row.vocabId)) latest.set(row.vocabId, row.grade);
  }

  const failing = [...latest.entries()]
    .filter(([, grade]) => grade === "again")
    .map(([id]) => id)
    .slice(0, MAX_ERROR_CARDS);
  if (failing.length === 0) return [];

  // Scoped to the learner AGAIN on the read, not only via the review
  // rows: ownership belongs in the query that returns the content, so a
  // bug upstream can never become someone else's words on the screen.
  if (deckId) {
    return db
      .select(wordCardColumns)
      .from(studyVocab)
      .innerJoin(studyDeckItems, eq(studyDeckItems.vocabId, studyVocab.id))
      .where(
        and(
          eq(studyVocab.learnerId, learnerId),
          eq(studyDeckItems.deckId, deckId),
          inArray(studyVocab.id, failing),
        ),
      );
  }

  return db
    .select(wordCardColumns)
    .from(studyVocab)
    .where(
      and(eq(studyVocab.learnerId, learnerId), inArray(studyVocab.id, failing)),
    );
}

