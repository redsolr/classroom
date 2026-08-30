import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, studyVocabListItems } from "@/db";

/**
 * Shared pieces the study ACTIONS need but cannot own between them.
 *
 * Both of these were private to the old monolithic `study.ts`, where
 * "shared" cost nothing because everything lived in one file. The split
 * turned each into a genuine cross-module dependency — `languageSchema`
 * is used by threads, words and books; `nextListPosition` by books and
 * by importing an official pack — and the only two ways to handle that
 * are a shared home or a copy per file. A copy is how two validators
 * drift until one accepts a language the other rejects.
 *
 * They live OUTSIDE `src/lib/actions/` deliberately: everything exported
 * from there is compiled into a public POST endpoint, so a helper placed
 * in that directory would become callable on its own and would trip the
 * auth ratchet for not resolving a caller it was never meant to.
 */

/** A language name as the UI offers it — not an ISO code, on purpose:
 * the roster is human-readable ("Japanese"), and words carry it. */
export const languageSchema = z.string().trim().min(2).max(40);

/** Append slot at the end of a book — max(position) + 1. */
export async function nextListPosition(listId: string): Promise<number> {
  const [{ max }] = await db
    .select({
      max: sql<number>`coalesce(max(${studyVocabListItems.position}), -1)`,
    })
    .from(studyVocabListItems)
    .where(eq(studyVocabListItems.listId, listId));
  return Number(max) + 1;
}
