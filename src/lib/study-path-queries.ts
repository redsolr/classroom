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
import { clozeToPlain } from "@/lib/cloze";
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
async function ownedWordsFromPack(learnerId: string, packSlug: string) {
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

// ---------------------------------------------------------------------------
// MICRO-NODES — what one node on the tree is actually made of.
//
// Opening a node has to show something its progress bar could not, or it
// is a tooltip with extra steps. So a node opens onto its own small
// constellation: one micro-node per REAL item behind the step — every
// word in the book, every word you could still make a sentence card for
// — each lit by the same evidence rule the rest of the app uses.
//
// Loaded on demand, never with the page: an eleven-node path would
// otherwise pull several hundred words and their cards to render eleven
// circles, and the learner opens two of them.
// ---------------------------------------------------------------------------

export type MicroNodeState = "known" | "started" | "empty";

export type MicroNode = {
  id: string;
  label: string;
  /** The second line — a meaning, a reading, whatever makes it findable. */
  hint?: string;
  state: MicroNodeState;
};

export type StepDetail = {
  stepId: string;
  /**
   * What each state MEANS here, in this step's own words. A shared
   * legend ("done / in progress / not started") is the kind of generic
   * that stops being read: for a pack node the honest sentence is
   * "recalled on a later day", and that is worth saying every time.
   */
  legend: Record<MicroNodeState, string>;
  nodes: MicroNode[];
  /** One true sentence about what is missing, when something is. */
  note?: string;
};

/**
 * A pack node's micro-nodes are the book's OWN words, in the book's
 * order — including the ones the learner has never saved, because "what
 * is still ahead of me in this book" is exactly what a node three tiers
 * up gets opened to answer.
 */
async function packMicroNodes(
  learnerId: string,
  packSlug: string,
): Promise<MicroNode[]> {
  // Two queries, matched in memory, rather than one join: joining on
  // term can return a pack item twice (see `oneRowPerTerm`), and here
  // that would draw two circles for one word — a constellation that
  // says the book is bigger than it is.
  const [items, owned] = await Promise.all([
    db
      .select({
        id: studyPackItems.id,
        term: studyPackItems.term,
        reading: studyPackItems.reading,
        meaning: studyPackItems.meaning,
      })
      .from(studyPacks)
      .innerJoin(studyPackItems, eq(studyPackItems.packId, studyPacks.id))
      .where(eq(studyPacks.slug, packSlug))
      .orderBy(studyPackItems.position),
    ownedWordsFromPack(learnerId, packSlug),
  ]);

  const status = new Map(owned.map((row) => [row.term, row.status]));

  return items.map((item) => {
    const state = status.get(item.term);
    return {
      id: item.id,
      label: item.term,
      hint: item.meaning ?? item.reading ?? undefined,
      state: !state
        ? ("empty" as const)
        : isKnown({ status: state })
          ? ("known" as const)
          : ("started" as const),
    };
  });
}

/**
 * A sentence node's micro-nodes are the learner's OWN words from that
 * book, each showing whether it has a cloze card and whether that card
 * has survived a return. The words with NO card are the interesting
 * half — they are what "Make cards" is for, and a node that showed only
 * existing cards could never say why it was stuck.
 */
async function sentenceMicroNodes(
  learnerId: string,
  packSlug: string,
): Promise<{ nodes: MicroNode[]; note?: string }> {
  const owned = await ownedWordsFromPack(learnerId, packSlug);

  if (owned.length === 0) {
    return {
      nodes: [],
      note: "Cards are generated from words you own — save some of this book's words and they will appear here.",
    };
  }

  const cards = await db
    .select({
      text: studySentences.text,
      status: studySentences.status,
      vocabId: studySentences.vocabId,
    })
    .from(studySentences)
    .where(
      and(
        eq(studySentences.learnerId, learnerId),
        inArray(
          studySentences.vocabId,
          owned.map((row) => row.vocabId),
        ),
      ),
    );

  const byVocab = new Map(
    cards.flatMap((card) => (card.vocabId ? [[card.vocabId, card] as const] : [])),
  );

  const nodes: MicroNode[] = owned.map((word) => {
    const card = byVocab.get(word.vocabId);
    return {
      id: word.vocabId,
      label: word.term,
      hint: card ? clozeToPlain(card.text) : "no card yet",
      state: !card
        ? ("empty" as const)
        : isKnown({ status: card.status })
          ? ("known" as const)
          : ("started" as const),
    };
  });

  const missing = nodes.filter((node) => node.state === "empty").length;
  return {
    nodes,
    note:
      missing > 0
        ? `${missing} of these words have no card yet — “Make cards” on Sentences writes them.`
        : undefined,
  };
}

/**
 * Chat and lesson steps have no per-item row worth drawing (a message is
 * not a thing you revisit), so their micro-nodes are the target itself,
 * one circle per unit. It is the same number the bar carries — but ten
 * circles with six lit is the shape of "four to go", which is the thing
 * the learner is actually deciding about.
 */
function countMicroNodes(
  done: number,
  target: number,
  noun: string,
): MicroNode[] {
  const total = Math.min(Math.max(1, target), 24);
  return Array.from({ length: total }, (_, i) => ({
    id: `${noun}-${i}`,
    label: `${noun} ${i + 1}`,
    state: i < done ? ("known" as const) : ("empty" as const),
  }));
}

/** The count a chat/lesson step is measured by. One at a time, because a
 * panel only ever opens one node. */
async function countedEvidence(
  learnerId: string,
  kind: PathStepProgress["kind"],
): Promise<number> {
  if (kind === "lesson") {
    return db
      .select({ count: sql<number>`count(*)::int` })
      .from(tutorBookings)
      .where(
        and(
          eq(tutorBookings.learnerId, learnerId),
          inArray(tutorBookings.status, ["confirmed", "completed"]),
        ),
      )
      .then((rows) => rows[0]?.count ?? 0);
  }
  return db
    .select({ count: sql<number>`count(*)::int` })
    .from(studyMessages)
    .where(
      and(
        eq(studyMessages.learnerId, learnerId),
        eq(studyMessages.role, "user"),
      ),
    )
    .then((rows) => rows[0]?.count ?? 0);
}

export async function loadStepDetail(
  learnerId: string,
  pathSlug: string,
  stepId: string,
): Promise<StepDetail | null> {
  const path = await db.query.studyPaths.findFirst({
    where: eq(studyPaths.slug, pathSlug),
    columns: { id: true },
  });
  if (!path) return null;

  // The step must belong to the path in the URL. Paths are shipped
  // content and carry nothing private, but an id from one path
  // resolving against another is the kind of looseness that stops being
  // harmless the first time a path is not public.
  const step = await db.query.studyPathSteps.findFirst({
    where: and(
      eq(studyPathSteps.id, stepId),
      eq(studyPathSteps.pathId, path.id),
    ),
  });
  if (!step) return null;

  if (step.kind === "pack" && step.packSlug) {
    return {
      stepId: step.id,
      legend: {
        known: "recalled on a later day",
        started: "in your vocabulary, not known yet",
        empty: "not saved yet",
      },
      nodes: await packMicroNodes(learnerId, step.packSlug),
    };
  }

  if (step.kind === "sentences" && step.packSlug) {
    const { nodes, note } = await sentenceMicroNodes(learnerId, step.packSlug);
    return {
      stepId: step.id,
      legend: {
        known: "completed on a later day",
        started: "has a card, not known yet",
        empty: "no card yet",
      },
      nodes,
      note,
    };
  }

  // Counted kinds — and the fallback for a pack step whose slug went
  // missing, which the seed refuses to ship but which should degrade to
  // an honest row of pips rather than an empty panel.
  const done = await countedEvidence(learnerId, step.kind);
  const noun = step.kind === "lesson" ? "Lesson" : "Message";
  return {
    stepId: step.id,
    legend: {
      known: step.kind === "lesson" ? "attended" : "sent",
      started: "in progress",
      empty: "still to go",
    },
    nodes: countMicroNodes(done, step.target, noun),
  };
}
