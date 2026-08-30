"use server";

import { z } from "zod";
import { requireLearner } from "@/lib/auth";
import { requireOwnDeck } from "@/lib/study-guards";
import { recordRun, summarise, type RunComparison } from "@/lib/deck-runs";
import { loadErrorDeck } from "@/lib/error-deck";

/**
 * Finishing a drill, and starting an error-only one.
 *
 * The run is recorded from the CLIENT at the end of the session rather
 * than accumulated server-side per card, because a run is only a run
 * once it is finished: a session abandoned halfway is not a record
 * anybody should be measured against, and per-card accumulation would
 * have to invent a rule for when to stop waiting.
 *
 * The grades are re-summarised here rather than trusting a client
 * summary — the numbers end up in a record board, and a posted
 * "accuracy: 100" is a claim, not a fact.
 */

const gradeSchema = z.enum(["again", "hard", "good", "easy"]);

export async function finishDeckRun(input: {
  deckId: string | null;
  kind: "word" | "sentence";
  grades: string[];
  durationMs: number | null;
}): Promise<RunComparison | null> {
  const learner = await requireLearner();

  const parsed = z
    .object({
      deckId: z.string().uuid().nullable(),
      kind: z.enum(["word", "sentence"]),
      // A drill is a drill; a posted 10,000-card run is not one.
      grades: z.array(gradeSchema).max(500),
      durationMs: z.number().int().positive().max(6 * 60 * 60 * 1000).nullable(),
    })
    .parse(input);

  // Nothing graded = nothing happened. Recording a zero-card run would
  // put "0%" on the record board for opening a page.
  if (parsed.grades.length === 0) return null;

  // Ownership, before the deck id reaches a stored row.
  if (parsed.deckId) await requireOwnDeck(learner.id, parsed.deckId);

  return recordRun({
    learnerId: learner.id,
    deckId: parsed.deckId,
    kind: parsed.kind,
    summary: summarise({
      grades: parsed.grades,
      durationMs: parsed.durationMs,
    }),
  });
}

/**
 * Deal the cards the learner most recently got WRONG.
 *
 * Graded for real, not as a cram round: these are cards the schedule has
 * already been told about, and the whole value of drilling them is that
 * getting one right now moves it. A schedule-neutral error deck would be
 * practice that never counts.
 */
export async function loadStudyErrorDeck(deckId?: string | null) {
  const learner = await requireLearner();
  const scoped = deckId ? await requireOwnDeck(learner.id, deckId) : null;
  return loadErrorDeck(learner.id, scoped?.id ?? null);
}
