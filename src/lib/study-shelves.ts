import { isCardDue } from "@/lib/srs";

/**
 * Shared shaping for the three surfaces that render collections —
 * Books, Decks and Home.
 *
 * All three answer the same two questions before they can draw anything:
 * which words are in which book, and which cards are due right now. They
 * each derived it inline, which meant three copies of the same two loops
 * and three chances for "due" to come to mean subtly different things on
 * different pages.
 */

/** vocab ids grouped by the book holding them, in the learner's order. */
export function membersByDeck(
  rows: { deckId: string; vocabId: string }[],
): Map<string, string[]> {
  const byList = new Map<string, string[]>();
  for (const row of rows) {
    const current = byList.get(row.deckId);
    if (current) current.push(row.vocabId);
    else byList.set(row.deckId, [row.vocabId]);
  }
  return byList;
}

/**
 * The ids of every card due at `now`. A Set, not a per-row predicate:
 * the callers all cross-reference it against book membership, and
 * re-deriving due-ness per book turns one pass into N.
 */
export function dueIds(
  cards: { id: string; srsDueAt: Date | null }[],
  now: Date,
): Set<string> {
  const due = new Set<string>();
  for (const card of cards) {
    if (isCardDue(card.srsDueAt, now)) due.add(card.id);
  }
  return due;
}
