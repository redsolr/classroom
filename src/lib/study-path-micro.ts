import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  studyMessages,
  studyPackItems,
  studyPacks,
  studyPathSteps,
  studyPaths,
  studySentences,
  tutorBookings,
} from "@/db";
import { clozeToPlain } from "@/lib/cloze";
import { ownedWordsFromPack } from "@/lib/study-path-queries";
import { isKnown, type PathStepProgress } from "@/lib/study-progress";

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
