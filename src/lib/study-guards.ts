import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, studyBooks, studyDecks } from "@/db";

/**
 * Ownership guards for learner-owned study rows.
 *
 * These are AUTHORIZATION, not authentication: the caller has already
 * resolved who is asking (`requireLearner()` in every server action —
 * `npm run check:actions` enforces that half) and passes the learner id
 * in. Their job is the half the ratchet cannot check: narrowing every
 * query to that learner's own rows.
 *
 * They live outside `src/lib/actions/` on purpose. Everything exported
 * from there is compiled into a public POST endpoint, so a guard placed
 * in that directory would become callable on its own — and would trip
 * the auth ratchet for not resolving a caller it was never meant to.
 */

/**
 * The learner owns this deck, or the call fails.
 *
 * The message says "Deck", not "Book" — they are different entities now
 * (a book CONTAINS decks), and two entities sharing one error string is
 * how a debugging session goes looking in the wrong table. That was a
 * real risk while both were called book.
 */
export async function requireOwnDeck(learnerId: string, deckId: string) {
  const id = z.string().uuid().parse(deckId);
  const deck = await db.query.studyDecks.findFirst({
    where: and(eq(studyDecks.id, id), eq(studyDecks.learnerId, learnerId)),
  });
  if (!deck) throw new Error("Deck not found");
  return deck;
}

/** The learner owns this book (the container), or the call fails. */
export async function requireOwnBook(learnerId: string, bookId: string) {
  const id = z.string().uuid().parse(bookId);
  const book = await db.query.studyBooks.findFirst({
    where: and(eq(studyBooks.id, id), eq(studyBooks.learnerId, learnerId)),
  });
  if (!book) throw new Error("Book not found");
  return book;
}
