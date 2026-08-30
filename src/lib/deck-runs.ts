import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, studyDeckRuns, type StudyDeckRun } from "@/db";

/**
 * HOW THIS RUN WENT, AND HOW IT COMPARES.
 *
 * The drill used to end on a blank "nothing due" screen, which is the
 * least interesting moment in the app to say nothing: the learner has
 * just done the work and is deciding whether to come back tomorrow. The
 * end of a session is where a game puts the score, and it is right to
 * put one here for the same reason — not to gamify, but because finishing
 * something and being told nothing about it feels like it didn't count.
 *
 * Every figure is what actually happened in the session, so there is no
 * tension with the evidence-only doctrine: a run summary is a record of
 * an event, not a claim about ability.
 */

export type RunSummary = {
  cards: number;
  correct: number;
  bestStreak: number;
  durationMs: number | null;
  /** Answers right, as a percentage. Null for an empty run. */
  accuracy: number | null;
};

export type RunComparison = {
  run: RunSummary;
  /** The best accuracy over this deck before today, if there is one. */
  bestAccuracy: number | null;
  bestStreak: number | null;
  /** Runs finished over this deck, this one included. */
  totalRuns: number;
  /** This run beat every previous one on accuracy. */
  isPersonalBest: boolean;
};

export function summarise(input: {
  grades: ("again" | "hard" | "good" | "easy")[];
  durationMs: number | null;
}): RunSummary {
  const { grades, durationMs } = input;
  let bestStreak = 0;
  let streak = 0;
  let correct = 0;
  for (const grade of grades) {
    // "again" is the only grade that means you did not have it — the same
    // definition the retention figure uses, so two numbers in one product
    // cannot disagree about what counts as knowing something.
    if (grade === "again") {
      streak = 0;
      continue;
    }
    correct += 1;
    streak += 1;
    if (streak > bestStreak) bestStreak = streak;
  }
  return {
    cards: grades.length,
    correct,
    bestStreak,
    durationMs,
    accuracy:
      grades.length === 0 ? null : Math.round((correct / grades.length) * 100),
  };
}

/**
 * Record a finished run and hand back how it compares.
 *
 * The previous best is read BEFORE the insert, so "personal best" means
 * "beat everything that came before" rather than "tied with itself".
 */
export async function recordRun(input: {
  learnerId: string;
  deckId: string | null;
  kind: "word" | "sentence";
  summary: RunSummary;
}): Promise<RunComparison> {
  const { learnerId, deckId, kind, summary } = input;

  const scope = and(
    eq(studyDeckRuns.learnerId, learnerId),
    deckId ? eq(studyDeckRuns.deckId, deckId) : isNull(studyDeckRuns.deckId),
    eq(studyDeckRuns.kind, kind),
  );

  const [previous] = await db
    .select({
      bestAccuracy: sql<number | null>`max(round((${studyDeckRuns.correct}::numeric / nullif(${studyDeckRuns.cards}, 0)) * 100))`,
      bestStreak: sql<number | null>`max(${studyDeckRuns.bestStreak})`,
      runs: sql<number>`count(*)::int`,
    })
    .from(studyDeckRuns)
    .where(scope);

  await db.insert(studyDeckRuns).values({
    learnerId,
    deckId,
    kind,
    cards: summary.cards,
    correct: summary.correct,
    bestStreak: summary.bestStreak,
    durationMs: summary.durationMs,
  });

  const bestAccuracy =
    previous?.bestAccuracy === null || previous?.bestAccuracy === undefined
      ? null
      : Number(previous.bestAccuracy);

  return {
    run: summary,
    bestAccuracy,
    bestStreak: previous?.bestStreak ?? null,
    totalRuns: (previous?.runs ?? 0) + 1,
    // A first run is not a "personal best" — there is nothing to have
    // beaten, and calling it one is the kind of empty praise that makes
    // the real one worth less when it arrives.
    isPersonalBest:
      bestAccuracy !== null &&
      summary.accuracy !== null &&
      summary.accuracy > bestAccuracy,
  };
}

/** Past runs over a deck, newest first — the "best records" list. */
export async function deckRunHistory(
  learnerId: string,
  deckId: string | null,
  limit = 5,
): Promise<StudyDeckRun[]> {
  return db
    .select()
    .from(studyDeckRuns)
    .where(
      and(
        eq(studyDeckRuns.learnerId, learnerId),
        deckId ? eq(studyDeckRuns.deckId, deckId) : isNull(studyDeckRuns.deckId),
      ),
    )
    .orderBy(desc(studyDeckRuns.finishedAt))
    .limit(limit);
}
