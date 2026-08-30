import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  studyMessages,
  studyPackItems,
  studyPacks,
  studyPathEnrollments,
  studyPathSteps,
  studyPaths,
  studySentences,
  studyVocab,
  tutorBookings,
  type StudyPath,
  type VocabularyItem,
} from "@/db";
import {
  isKnown,
  nextStep,
  stepProgress,
  type PathStepProgress,
} from "@/lib/study-progress";

/**
 * Reading a learning path FOR a learner — the catalog joined to what
 * they have actually done.
 *
 * Every step's completion is evidence, computed here from the same rows
 * the rest of the app reads. Nothing about a learner's position is
 * stored: there is no "current step" column, because the moment one
 * exists it can disagree with the review history, and then either the
 * number is wrong or the learner is being told they have not done
 * something they did. Derived is slower and always true.
 *
 * The consequence worth knowing: rewriting a path's steps in
 * `content/study-paths.ts` is SAFE. Progress does not hang off step ids,
 * so the seed can replace them wholesale and every learner's position
 * re-derives correctly on the next page load.
 */

type VocabularyStatus = VocabularyItem["status"];

export type PathWithProgress = StudyPath & {
  steps: PathStepProgress[];
  next: PathStepProgress | undefined;
  completedSteps: number;
  percent: number;
  enrolled: boolean;
};

/**
 * The learner's own words that came from a given official book, matched
 * on term.
 *
 * Term-matching rather than a provenance column, and that is the same
 * signal the pack view's heart already uses: a word is a word, and
 * someone who typed 猫 by hand before finding the book has genuinely
 * learned it. Recording where a word came from and then only counting
 * words that came from HERE would make the path punish people for
 * knowing things already.
 */
export async function ownedWordsFromPack(learnerId: string, packSlug: string) {
  const rows = await db
    .select({
      term: studyPackItems.term,
      status: studyVocab.status,
      vocabId: studyVocab.id,
    })
    .from(studyPacks)
    .innerJoin(studyPackItems, eq(studyPackItems.packId, studyPacks.id))
    .innerJoin(
      studyVocab,
      and(
        eq(studyVocab.learnerId, learnerId),
        eq(studyVocab.term, studyPackItems.term),
      ),
    )
    .where(eq(studyPacks.slug, packSlug))
    .orderBy(studyPackItems.position);
  return oneRowPerTerm(rows);
}

/**
 * One row per WORD, whatever the join produced.
 *
 * `study_vocab` has no unique index on (learner, term) — a learner can
 * hold the same term twice (two languages, a hand-typed duplicate, an
 * import that ran before a rename) — so joining a pack to a learner's
 * vocabulary ON TERM can return a pack item twice. Left alone that
 * inflates every count on this page: a step asking for 10 words could
 * read 12/10 with nine words actually learned, and the tree would light
 * a node the learner has not finished. The best status wins, because if
 * one of the duplicates has survived a return then the learner knows the
 * word.
 */
function oneRowPerTerm<T extends { term: string; status: VocabularyStatus }>(
  rows: T[],
): T[] {
  const rank: Record<VocabularyStatus, number> = {
    new: 0,
    learning: 1,
    reviewing: 2,
    mastered: 3,
  };
  const best = new Map<string, T>();
  for (const row of rows) {
    const current = best.get(row.term);
    if (!current || rank[row.status] > rank[current.status]) {
      best.set(row.term, row);
    }
  }
  return [...best.values()];
}

export async function loadPathForLearner(
  learnerId: string,
  slug: string,
): Promise<PathWithProgress | null> {
  const path = await db.query.studyPaths.findFirst({
    where: eq(studyPaths.slug, slug),
  });
  if (!path) return null;

  const [steps, enrollment] = await Promise.all([
    db
      .select()
      .from(studyPathSteps)
      .where(eq(studyPathSteps.pathId, path.id))
      .orderBy(studyPathSteps.position),
    db.query.studyPathEnrollments.findFirst({
      where: and(
        eq(studyPathEnrollments.learnerId, learnerId),
        eq(studyPathEnrollments.pathId, path.id),
      ),
    }),
  ]);

  // Counts every step kind needs, fetched once rather than per step —
  // a five-step path was otherwise five round trips for two numbers.
  const [messageCount, lessonCount] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(studyMessages)
      .where(
        and(
          eq(studyMessages.learnerId, learnerId),
          eq(studyMessages.role, "user"),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tutorBookings)
      .where(
        and(
          eq(tutorBookings.learnerId, learnerId),
          inArray(tutorBookings.status, ["confirmed", "completed"]),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0),
  ]);

  const withProgress: PathStepProgress[] = [];
  for (const step of steps) {
    let done = 0;
    switch (step.kind) {
      case "pack": {
        if (!step.packSlug) break;
        const owned = await ownedWordsFromPack(learnerId, step.packSlug);
        // KNOWN, not owned. Saving fifty words is not progress; getting
        // them back on a later day is.
        done = owned.filter(isKnown).length;
        break;
      }
      case "sentences": {
        if (!step.packSlug) break;
        const owned = await ownedWordsFromPack(learnerId, step.packSlug);
        const vocabIds = owned.map((row) => row.vocabId);
        if (vocabIds.length === 0) break;
        const cards = await db
          .select({ status: studySentences.status })
          .from(studySentences)
          .where(
            and(
              eq(studySentences.learnerId, learnerId),
              inArray(studySentences.vocabId, vocabIds),
            ),
          );
        done = cards.filter(isKnown).length;
        break;
      }
      case "chat":
        done = messageCount;
        break;
      case "lesson":
        done = lessonCount;
        break;
    }
    withProgress.push(stepProgress(step, { done, target: step.target }));
  }

  const completedSteps = withProgress.filter((s) => s.complete).length;
  return {
    ...path,
    steps: withProgress,
    next: nextStep(withProgress),
    completedSteps,
    percent:
      withProgress.length === 0
        ? 0
        : Math.round((completedSteps / withProgress.length) * 100),
    enrolled: Boolean(enrollment),
  };
}

/**
 * Every path, with the learner's progress on each — the catalog page and
 * Home's suggestion both read this.
 *
 * Paths the learner is ENROLLED in come first; then paths in a language
 * they already study (the same honest recommendation rule the official
 * books use — it can say why it is being shown); then the rest.
 */
export async function loadPathsForLearner(
  learnerId: string,
): Promise<PathWithProgress[]> {
  const [all, studied] = await Promise.all([
    db.select().from(studyPaths).orderBy(studyPaths.position),
    db
      .selectDistinct({ language: studyVocab.language })
      .from(studyVocab)
      .where(eq(studyVocab.learnerId, learnerId))
      .then((rows) => new Set(rows.map((r) => r.language))),
  ]);

  const loaded: PathWithProgress[] = [];
  for (const path of all) {
    const withProgress = await loadPathForLearner(learnerId, path.slug);
    if (withProgress) loaded.push(withProgress);
  }

  return loaded.sort((a, b) => {
    const rank = (p: PathWithProgress) =>
      p.enrolled ? 0 : studied.has(p.language) ? 1 : 2;
    return rank(a) - rank(b) || a.position - b.position;
  });
}

/**
 * The ONE path to point at from Home: the one they are on, or — if they
 * are on none — the one in a language they are already learning.
 *
 * Home shows at most one. A home page that suggests three curricula has
 * not made a recommendation, it has made a menu, and the learner who
 * needed guidance is exactly the one who cannot choose from it.
 */
export async function suggestedPath(
  learnerId: string,
): Promise<PathWithProgress | null> {
  const paths = await loadPathsForLearner(learnerId);
  const enrolled = paths.find((p) => p.enrolled && p.percent < 100);
  if (enrolled) return enrolled;
  return paths.find((p) => !p.enrolled) ?? null;
}
