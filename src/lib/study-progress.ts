import { isCardDue } from "@/lib/srs";
import type { StudyPathStep, VocabularyItem } from "@/db";

/**
 * MEASURABLE PROGRESS — the learner's own answer to "am I actually
 * getting anywhere".
 *
 * This is the half of the product that was missing. The app could say
 * what was due and what existed; it could not say whether four weeks of
 * work had moved anything. Which is the question that decides whether
 * someone keeps going.
 *
 * ── The one rule ───────────────────────────────────────────────────
 *
 * Every number here is DERIVED FROM REVIEW EVIDENCE. Nothing is
 * asserted, nothing is inferred by a model, and there is no level. That
 * is the standing doctrine (FEATURES.md cuts "AI-asserted level jumps"),
 * and it is not squeamishness: a progress number a learner cannot trace
 * back to something they actually did is worse than no number, because
 * the first time it disagrees with how they feel they stop believing all
 * of them. "31 words you have recalled correctly, four sessions in a
 * row" survives being questioned. "Level B1" does not.
 *
 * So: counts, streaks, retention, coverage. Every one of them is a fact
 * about what the learner did, phrased as one.
 */

/** A card the pipeline can read — words and sentences share this shape. */
export type ReviewedCard = {
  status: VocabularyItem["status"];
  srsReps: number;
  srsDueAt: Date | null;
  lastReviewedAt: Date | null;
};

export type ReviewEvent = { reviewedAt: Date; correct: boolean };

export type ProgressPipeline = {
  new: number;
  learning: number;
  reviewing: number;
  mastered: number;
  total: number;
};

export type StudyProgressSummary = {
  words: ProgressPipeline;
  sentences: ProgressPipeline;
  /** Cards you have got right at least once — the honest "I know this". */
  knownCards: number;
  /** Everything you are carrying, known or not. */
  totalCards: number;
  /** Correct answers as a share of graded answers, last 30 days. Null
   * when there is not enough evidence to say anything. */
  retentionPercent: number | null;
  /** Consecutive days ending today (or yesterday) with a review in them. */
  streakDays: number;
  /** Days out of the last 30 with at least one review. */
  activeDaysLast30: number;
  /** Reviews per day for the last 14 days, oldest first — the trend. */
  recentActivity: { date: string; count: number }[];
  /** Cards that first reached `reviewing` or better in the last 30 days. */
  newlyKnownLast30: number;
};

const ACTIVITY_DAYS = 14;
const WINDOW_DAYS = 30;

/** Local calendar day key. Reviews belong to the day the learner had,
 * not to a UTC day boundary that cuts their evening in half. */
function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pipeline(cards: ReviewedCard[]): ProgressPipeline {
  const counts: ProgressPipeline = {
    new: 0,
    learning: 0,
    reviewing: 0,
    mastered: 0,
    total: cards.length,
  };
  for (const card of cards) counts[card.status] += 1;
  return counts;
}

/**
 * "Known" is `reviewing` or `mastered` — a card that has survived at
 * least one scheduled return, not one you clicked Good on once in the
 * session you added it. The distinction is the whole point: recognising
 * a word ten seconds after reading its meaning is not knowing it.
 */
export function isKnown(card: Pick<ReviewedCard, "status">): boolean {
  return card.status === "reviewing" || card.status === "mastered";
}

export function buildStudyProgress(input: {
  words: ReviewedCard[];
  sentences: ReviewedCard[];
  /** Every graded answer, any card type, newest or oldest order. */
  reviews: ReviewEvent[];
  now: Date;
}): StudyProgressSummary {
  const { words, sentences, reviews, now } = input;
  const allCards = [...words, ...sentences];

  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

  const inWindow = reviews.filter((r) => r.reviewedAt >= windowStart);
  const graded = inWindow.length;
  const retentionPercent =
    // Under ten answers, a single miss swings the number by ten points.
    // A statistic that unstable is not information, so we decline to
    // show one rather than showing a jumpy one.
    graded >= 10
      ? Math.round((inWindow.filter((r) => r.correct).length / graded) * 100)
      : null;

  const byDay = new Map<string, number>();
  for (const review of reviews) {
    const key = dayKey(review.reviewedAt);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  const recentActivity: { date: string; count: number }[] = [];
  for (let i = ACTIVITY_DAYS - 1; i >= 0; i -= 1) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const key = dayKey(day);
    recentActivity.push({ date: key, count: byDay.get(key) ?? 0 });
  }

  /**
   * The streak counts back from today, and a day with no reviews YET
   * does not break it — you have not failed to study today until today
   * is over. Any other rule punishes people for opening the app in the
   * morning, which is when we most want them to open it.
   */
  let streakDays = 0;
  const cursor = new Date(now);
  if (!byDay.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (byDay.has(dayKey(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const activeDaysLast30 = [...byDay.keys()].filter(
    (key) => new Date(`${key}T00:00:00`) >= windowStart,
  ).length;

  const newlyKnownLast30 = allCards.filter(
    (card) =>
      isKnown(card) && card.lastReviewedAt && card.lastReviewedAt >= windowStart,
  ).length;

  return {
    words: pipeline(words),
    sentences: pipeline(sentences),
    knownCards: allCards.filter(isKnown).length,
    totalCards: allCards.length,
    retentionPercent,
    streakDays,
    activeDaysLast30,
    recentActivity,
    newlyKnownLast30,
  };
}

// ---------------------------------------------------------------------------
// Path step completion — the same rule, applied per step.
// ---------------------------------------------------------------------------

export type StepEvidence = {
  /** How much of this step's target the learner has actually reached. */
  done: number;
  target: number;
};

export type PathStepProgress = StudyPathStep & {
  done: number;
  complete: boolean;
  /** 0-100, for the bar. Capped: overshooting a target is not 140% done. */
  percent: number;
};

export function stepProgress(
  step: StudyPathStep,
  evidence: StepEvidence,
): PathStepProgress {
  const target = Math.max(1, evidence.target);
  const done = Math.max(0, evidence.done);
  return {
    ...step,
    done,
    complete: done >= target,
    percent: Math.min(100, Math.round((done / target) * 100)),
  };
}

/**
 * Which step the path points at next: the first incomplete one.
 *
 * "First incomplete" and not "first after the last complete", because
 * steps do NOT gate each other — a learner who jumped ahead and finished
 * step 4 should still be pointed back at the foundation they skipped.
 * That is the whole difference between guiding and railroading.
 */
export function nextStep(
  steps: PathStepProgress[],
): PathStepProgress | undefined {
  return steps.find((step) => !step.complete);
}

/** Cards from this path's books that are due right now — what makes a
 * path a live surface rather than a checklist. */
export function dueInPath(
  cards: { srsDueAt: Date | null }[],
  now: Date,
): number {
  return cards.filter((card) => isCardDue(card.srsDueAt, now)).length;
}
