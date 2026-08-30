import { STUDY_VOCAB_CATEGORIES } from "@/lib/study-vocab-categories";
import { isKnown, type ReviewedCard } from "@/lib/study-progress";

/**
 * THE GRADING SYSTEM — rewards, and what you can actually talk about.
 *
 * The founder's ask was "our own grading system that is rewards and also
 * able to tell more which area learners can now have a conversation in".
 * The second half is the hard half, and it runs straight at the standing
 * rule that this product does not assert a level.
 *
 * ── How that tension is resolved ───────────────────────────────────
 *
 * We do not say "you are B1". We say what is TRUE and let it be useful:
 *
 *     "You know 38 of the 45 words in Café survival French."
 *     "That's enough to order, ask for the bill, and understand the
 *      answer."
 *
 * The first sentence is a count of cards the learner got right on a
 * later day. The second is a fixed description attached to that topic in
 * content — not a model's opinion of their ability, and not a claim
 * about a skill we never observed. If they can be doubted on it, they
 * can go and count the words.
 *
 * The distinction that keeps this honest, and it is worth defending the
 * next time someone asks for a level: we report COVERAGE OF A TOPIC, not
 * PROFICIENCY. "You have the vocabulary for this conversation" is
 * checkable. "You can have this conversation" is a guess about a person,
 * and the first time it is wrong they stop believing everything else on
 * the page.
 *
 * ── Rewards ────────────────────────────────────────────────────────
 *
 * Every badge below is derived from evidence and every one names what
 * earned it. A reward you cannot trace to something you did is just a
 * sticker, and learners work that out fast.
 */

// ---------------------------------------------------------------------------
// Conversation areas
// ---------------------------------------------------------------------------

/**
 * What a topic's vocabulary lets you DO, keyed by the official book's
 * slug. Written by us, per topic — content, not inference.
 *
 * Deliberately concrete and small. "You can discuss abstract concepts"
 * is the kind of sentence that means nothing; "order, ask for the bill,
 * and understand the answer" is a thing the learner can go and try.
 */
export const TOPIC_ABILITIES: Record<string, string> = {
  "cafe-french":
    "order food and drink, ask for the bill, and follow the answer",
  "anime-essentials-japanese":
    "follow the everyday lines that carry most scenes",
  "gaming-japanese": "read menus and item screens without a dictionary",
  "dragon-ball-japanese": "follow a fight scene and the talk around it",
  "death-note-japanese": "follow the reasoning scenes rather than the action",
  "one-piece-japanese": "follow a crew conversation and the names for things",
  "naruto-japanese": "follow the training and mission talk",
  "persona-5-japanese": "follow school life and the palace scenes",
  "final-fantasy-vii-japanese": "follow the story scenes and the menus",
};

/** How much of a topic counts as "you have the words for this". */
const CONVERSATION_THRESHOLD = 0.7;

export type ConversationArea = {
  slug: string;
  name: string;
  known: number;
  total: number;
  percent: number;
  /** Past the threshold — the learner has the vocabulary for it. */
  ready: boolean;
  /** What that vocabulary lets them do, when we have said so. */
  ability: string | null;
};

export function conversationAreas(
  topics: {
    slug: string;
    name: string;
    cards: { status: ReviewedCard["status"] }[];
    total: number;
  }[],
): ConversationArea[] {
  return topics
    .map((topic) => {
      const known = topic.cards.filter(isKnown).length;
      const percent =
        topic.total === 0 ? 0 : Math.round((known / topic.total) * 100);
      return {
        slug: topic.slug,
        name: topic.name,
        known,
        total: topic.total,
        percent,
        ready: topic.total > 0 && known / topic.total >= CONVERSATION_THRESHOLD,
        ability: TOPIC_ABILITIES[topic.slug] ?? null,
      };
    })
    .filter((t) => t.known > 0)
    .sort((a, b) => b.percent - a.percent);
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export type Award = {
  key: string;
  label: string;
  /** What earned it, in the learner's own numbers. */
  earned: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
};

export type AwardInput = {
  knownCards: number;
  streakDays: number;
  platinumDecks: number;
  retentionPercent: number | null;
  wordClassesKnown: number;
  readyAreas: number;
};

/**
 * Thresholds are ROUND NUMBERS a learner can aim at, and each badge
 * states the evidence in its own text. Nothing here is awarded for
 * showing up — every one requires cards that came back on a later day
 * and were still known, which is the same bar the rest of the app uses.
 */
export function awards(input: AwardInput): Award[] {
  const out: Award[] = [];

  const knownTiers: [number, Award["tier"]][] = [
    [500, "platinum"],
    [200, "gold"],
    [50, "silver"],
    [10, "bronze"],
  ];
  const knownTier = knownTiers.find(([n]) => input.knownCards >= n);
  if (knownTier) {
    out.push({
      key: "known",
      label: "Vocabulary",
      earned: `${input.knownCards} cards you've recalled on a later day`,
      tier: knownTier[1],
    });
  }

  const streakTiers: [number, Award["tier"]][] = [
    [100, "platinum"],
    [30, "gold"],
    [7, "silver"],
    [3, "bronze"],
  ];
  const streakTier = streakTiers.find(([n]) => input.streakDays >= n);
  if (streakTier) {
    out.push({
      key: "streak",
      label: "Consistency",
      earned: `${input.streakDays} days in a row`,
      tier: streakTier[1],
    });
  }

  if (input.platinumDecks > 0) {
    out.push({
      key: "platinum-decks",
      label: "Finished decks",
      earned: `${input.platinumDecks} deck${input.platinumDecks === 1 ? "" : "s"} fully mastered`,
      tier: input.platinumDecks >= 5 ? "platinum" : "gold",
    });
  }

  // Retention is the only badge with a FLOOR on evidence — a 100% figure
  // off four answers is not an achievement, it is a small sample.
  if (input.retentionPercent !== null && input.retentionPercent >= 90) {
    out.push({
      key: "recall",
      label: "Recall",
      earned: `${input.retentionPercent}% right over the last 30 days`,
      tier: input.retentionPercent >= 95 ? "gold" : "silver",
    });
  }

  if (input.wordClassesKnown >= STUDY_VOCAB_CATEGORIES.length) {
    out.push({
      key: "breadth",
      label: "Breadth",
      earned: "words known in every word class",
      tier: "gold",
    });
  }

  if (input.readyAreas > 0) {
    out.push({
      key: "areas",
      label: "Conversation areas",
      earned: `${input.readyAreas} topic${input.readyAreas === 1 ? "" : "s"} you have the words for`,
      tier: input.readyAreas >= 3 ? "gold" : "silver",
    });
  }

  return out;
}

/** Tier → the colour it wears. Kept beside the tiers so a new one cannot
 * be added without deciding what it looks like. */
export const TIER_CLASS: Record<Award["tier"], string> = {
  bronze: "bg-[hsl(28_45%_38%)] text-white",
  silver: "bg-[hsl(220_9%_55%)] text-white",
  gold: "bg-[hsl(43_74%_42%)] text-white",
  platinum:
    "bg-gradient-to-br from-[hsl(200_30%_72%)] to-[hsl(260_25%_58%)] text-white",
};
