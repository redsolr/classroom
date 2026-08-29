import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, studyVocabLists } from "@/db";

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
 * The learner owns this vocabulary book, or the call fails.
 *
 * "Vocabulary book" rather than plain "book" in the message: the
 * reading list has books too (`study_books`), and two entities sharing
 * one error string is how a debugging session goes looking in the wrong
 * table.
 */
export async function requireOwnVocabList(learnerId: string, listId: string) {
  const id = z.string().uuid().parse(listId);
  const list = await db.query.studyVocabLists.findFirst({
    where: and(
      eq(studyVocabLists.id, id),
      eq(studyVocabLists.learnerId, learnerId),
    ),
  });
  if (!list) throw new Error("Vocabulary book not found");
  return list;
}
