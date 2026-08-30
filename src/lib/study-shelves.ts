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

// ---------------------------------------------------------------------------
// The official catalog, arranged for browsing.
// ---------------------------------------------------------------------------

/** The shape Home reads a pack row in — id/slug/name are for the card. */
export type CatalogPack = {
  id: string;
  slug: string;
  name: string;
  language: string;
  theme: string | null;
  itemCount: number;
};

/**
 * The catalog grouped onto its editorial shelves.
 *
 * Order comes from the caller's list rather than from how many books
 * happen to sit on each shelf, so the page does not rearrange itself the
 * week someone adds three books to one theme. Empty shelves are dropped:
 * that is what lets this scale down to a small catalog without ever
 * rendering a titled row with nothing under it.
 */
export function shelvesByTheme<T extends string>(
  packs: CatalogPack[],
  order: readonly T[],
  label: Record<T, string>,
): { theme: T; label: string; packs: CatalogPack[] }[] {
  return order
    .map((theme) => ({
      theme,
      label: label[theme],
      packs: packs.filter((pack) => pack.theme === theme),
    }))
    .filter((shelf) => shelf.packs.length > 0);
}

/**
 * One entry per language the catalog actually ships, with what is behind
 * it. The counts are the honest part: "Japanese · 8 books · 146 words" is
 * checkable, and it is the difference between offering a language and
 * merely naming one. Most to offer first.
 */
export function languagesInCatalog(
  packs: CatalogPack[],
): { name: string; books: number; words: number }[] {
  const byLanguage = new Map<string, { books: number; words: number }>();
  for (const pack of packs) {
    const entry = byLanguage.get(pack.language) ?? { books: 0, words: 0 };
    entry.books += 1;
    entry.words += pack.itemCount;
    byLanguage.set(pack.language, entry);
  }
  return [...byLanguage]
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => b.words - a.words);
}
