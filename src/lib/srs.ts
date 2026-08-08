/**
 * SM-2-lite spaced repetition (Anki-flavored).
 *
 * Pure functions only — the portal review action applies the result to the
 * vocabulary item and logs the review. The vocabulary status pipeline is
 * DERIVED from SRS evidence (deriveVocabularyStatus), so a card the student
 * keeps failing honestly demotes, and "mastered" is earned, never asserted.
 */

export type ReviewGrade = "again" | "hard" | "good" | "easy";

export type SrsState = {
  reps: number;
  easeFactor: number;
  intervalDays: number;
};

export type SrsResult = SrsState & {
  /** When the card is due next, relative to the review moment. */
  dueInMs: number;
};

const MIN_EASE = 1.3;
const AGAIN_RELEARN_MS = 10 * 60 * 1000; // failed cards come back in ~10 min
const DAY_MS = 24 * 60 * 60 * 1000;

export function nextSrsState(state: SrsState, grade: ReviewGrade): SrsResult {
  const ease = state.easeFactor;

  switch (grade) {
    case "again":
      return {
        reps: 0,
        easeFactor: Math.max(MIN_EASE, ease - 0.2),
        intervalDays: 0,
        dueInMs: AGAIN_RELEARN_MS,
      };
    case "hard": {
      const intervalDays = Math.max(1, state.intervalDays * 1.2);
      return {
        reps: state.reps + 1,
        easeFactor: Math.max(MIN_EASE, ease - 0.15),
        intervalDays,
        dueInMs: intervalDays * DAY_MS,
      };
    }
    case "good": {
      const intervalDays =
        state.reps === 0 ? 1 : state.reps === 1 ? 3 : state.intervalDays * ease;
      return {
        reps: state.reps + 1,
        easeFactor: ease,
        intervalDays,
        dueInMs: intervalDays * DAY_MS,
      };
    }
    case "easy": {
      const intervalDays = Math.max(4, state.intervalDays * ease * 1.3);
      return {
        reps: state.reps + 1,
        easeFactor: ease + 0.15,
        intervalDays,
        dueInMs: intervalDays * DAY_MS,
      };
    }
  }
}

/**
 * Evidence-based pipeline status. Thresholds, not judgments:
 * mastered = the student has kept it for 3+ weeks across 4+ successful
 * reviews; a relapse ("again") demotes because the evidence changed.
 */
export function deriveVocabularyStatus(
  next: SrsState,
): "new" | "learning" | "reviewing" | "mastered" {
  if (next.intervalDays >= 21 && next.reps >= 4) return "mastered";
  if (next.intervalDays >= 7) return "reviewing";
  return "learning";
}

export type SrsReviewPatch = {
  srsReps: number;
  srsEaseFactor: number;
  srsIntervalDays: number;
  srsDueAt: Date;
  lastReviewedAt: Date;
  status: "new" | "learning" | "reviewing" | "mastered";
};

/**
 * One graded review as the column patch both vocabulary tables share
 * (roster `vocabulary_items` and learner `study_vocab` use identical SRS
 * column names) — the review actions spread it into their updates
 * instead of each re-deriving schedule + status.
 */
export function srsReviewPatch(
  state: SrsState,
  grade: ReviewGrade,
  now: Date,
): SrsReviewPatch {
  const next = nextSrsState(state, grade);
  return {
    srsReps: next.reps,
    srsEaseFactor: next.easeFactor,
    srsIntervalDays: next.intervalDays,
    srsDueAt: new Date(now.getTime() + next.dueInMs),
    lastReviewedAt: now,
    status: deriveVocabularyStatus(next),
  };
}

/** A card with no srsDueAt has never been reviewed — always due. */
export function isCardDue(srsDueAt: Date | null, now: Date): boolean {
  return srsDueAt === null || srsDueAt <= now;
}
