/**
 * What a review card IS — shared across the server/client boundary.
 *
 * These live in `lib`, not in the drill component, because the pages
 * that BUILD decks are server components and the component that deals
 * them is a client one. Types and the row-tagging helpers sit in a plain
 * module both can import; putting them in the `"use client"` file made
 * `toWordCards()` a client function the server was not allowed to call —
 * which `tsc` and `next build` both accept and only a real page load
 * rejects.
 *
 * The two card types are a UNION rather than one row with half its
 * columns null. They share the deck machinery — the stack, the swipe,
 * the optimistic save, the scheduler — and nothing else: a word card
 * asks what a word means, a sentence card asks whether you can still
 * supply it when a sentence needs it.
 */

export type WordCard = {
  kind: "word";
  id: string;
  language: string;
  term: string;
  reading: string | null;
  meaning: string | null;
  example: string | null;
};

export type SentenceCard = {
  kind: "sentence";
  id: string;
  language: string;
  /** Cloze text — exactly one `{{…}}` span, the thing being tested. */
  text: string;
  translation: string | null;
  note: string | null;
};

export type ReviewCard = WordCard | SentenceCard;

/** Which card type a session deals. Session-level, not read off the
 * first card: an EMPTY sentence deck still has to offer sentence
 * practice, not word practice. */
export type DeckKind = "word" | "sentence";

/**
 * Tag DB rows as cards. Every deck comes out of a `db.select()` that
 * knows its own table but not the union's discriminant, so the tag has
 * to be added somewhere — and doing it inline at each call site is
 * exactly the shape where one forgotten `kind` becomes a card that
 * renders as the wrong type.
 */
export function toWordCards(rows: Omit<WordCard, "kind">[]): ReviewCard[] {
  return rows.map((row) => ({ ...row, kind: "word" }));
}

export function toSentenceCards(
  rows: Omit<SentenceCard, "kind">[],
): ReviewCard[] {
  return rows.map((row) => ({ ...row, kind: "sentence" }));
}
