import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, studyReviews, studySentences, studyVocab } from "@/db";
import { srsReviewPatch, type ReviewGrade } from "@/lib/srs";

/**
 * ONE graded review, for every card type.
 *
 * `src/lib/srs.ts` is the pure scheduler — given a card's state and a
 * grade, what's the next state. This is the other half: reading that
 * state off a learner-owned row and writing the result back. Word cards
 * (`study_vocab`) and sentence cards (`study_sentences`) keep SEPARATE
 * schedules by design, but they ran the identical read-compute-write
 * three times over, which meant any change to how a grade is persisted
 * had to be made twice and would silently drift the day someone made it
 * once.
 *
 * The two tables share the SRS column names deliberately (see the
 * schema), which is what lets one function serve both.
 */

/** The tables that carry an SM-2 schedule. */
type SrsCardTable = typeof studyVocab | typeof studySentences;

const gradeSchema = z.enum(["again", "hard", "good", "easy"]);

export async function gradeOwnedCard(
  table: SrsCardTable,
  learnerId: string,
  cardId: string,
  grade: ReviewGrade,
  /** What to say when the row isn't the learner's — the caller knows
   * which entity it asked for. */
  notFoundMessage: string,
): Promise<void> {
  const id = z.string().uuid().parse(cardId);
  const parsedGrade = gradeSchema.parse(grade);
  // Ownership is part of the WHERE on both the read and the write, so a
  // card belonging to someone else is indistinguishable from one that
  // does not exist.
  const owned = and(eq(table.id, id), eq(table.learnerId, learnerId));

  const [card] = await db
    .select({
      srsReps: table.srsReps,
      srsEaseFactor: table.srsEaseFactor,
      srsIntervalDays: table.srsIntervalDays,
    })
    .from(table)
    .where(owned)
    .limit(1);
  if (!card) throw new Error(notFoundMessage);

  const now = new Date();
  const patch = srsReviewPatch(
    {
      reps: card.srsReps,
      easeFactor: card.srsEaseFactor,
      intervalDays: card.srsIntervalDays,
    },
    parsedGrade,
    now,
  );

  await db
    .update(table)
    .set({ ...patch, updatedAt: now })
    .where(owned);

  /**
   * LOG THE ANSWER. The card row now knows when it is next due; only
   * this row knows that the learner showed up today and got it right.
   * Every progress number the learner is shown — retention, streak, the
   * activity trend — reads from here, which is what lets each of them be
   * traced back to something they actually did.
   *
   * Written inside the same funnel as the schedule update, not beside
   * it at the call sites, so a third card type cannot be added that
   * quietly stops logging.
   */
  const isSentence = table === studySentences;
  await db.insert(studyReviews).values({
    learnerId,
    kind: isSentence ? "sentence" : "word",
    vocabId: isSentence ? null : id,
    sentenceId: isSentence ? id : null,
    grade: parsedGrade,
    intervalDays: patch.srsIntervalDays,
  });
}
