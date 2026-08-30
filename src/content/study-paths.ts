/**
 * THE SHIPPED LEARNING PATHS — the guided foundation, checked in like
 * the pack catalog and synced by `scripts/seed-paths.ts` (which also
 * runs on every deploy, right after the packs).
 *
 * A path is an ORDER, not a gate. Every step is open from the first day;
 * the path's whole job is to answer "what should I do first", which the
 * app previously could not answer at all. A learner who wants to jump to
 * the sentences is not doing it wrong — but if they never come back, the
 * path should still be pointing at the foundation they skipped, which is
 * why `nextStep` finds the first INCOMPLETE step rather than the one
 * after the last completed one.
 *
 * Steps deliberately mix card work with human work. A path that is only
 * flashcards teaches someone to recognise words they have never once
 * said out loud, and every learner who has done that knows the feeling
 * of freezing in a real conversation. So: learn the words, drill them in
 * context, use them with the tutor, then use them with a person.
 *
 * `packSlug` must match a slug in `study-packs.ts` — `seed-paths.ts`
 * fails loudly on a typo rather than shipping a step that points at
 * nothing.
 */

export type PathStepContent = {
  kind: "pack" | "sentences" | "chat" | "lesson";
  title: string;
  detail: string;
  /** The official book this step is about (pack + sentences steps). */
  packSlug?: string;
  /**
   * What counts as done, in the step's own unit — words known for a
   * pack, cards reviewed for sentences, messages for a chat, lessons
   * attended for a lesson. Completion is derived from that evidence.
   */
  target: number;
};

export type PathContent = {
  slug: string;
  name: string;
  language: string;
  description: string;
  steps: PathStepContent[];
};

export const STUDY_PATH_CATALOG: PathContent[] = [
  {
    slug: "japanese-foundation",
    name: "Japanese from zero",
    language: "Japanese",
    description:
      "The first three months, in the order that actually works: a core of words you will meet constantly, then the same words inside sentences, then saying them to someone.",
    steps: [
      {
        kind: "pack",
        title: "Learn the everyday core",
        detail:
          "Anime essentials is the fastest honest start — these are the words that appear in almost everything, so every one you learn pays off immediately.",
        packSlug: "anime-essentials-japanese",
        target: 20,
      },
      {
        kind: "sentences",
        title: "Put those words in sentences",
        detail:
          "Recognising a word is not knowing it. Cloze cards ask whether you can still supply it when a sentence needs it — which is the thing that transfers to speaking.",
        packSlug: "anime-essentials-japanese",
        target: 10,
      },
      {
        kind: "chat",
        title: "Use them with the tutor",
        detail:
          "Have a real conversation using what you have. The tutor corrects as you go and offers to save anything new — this is where words stop being cards.",
        target: 10,
      },
      {
        kind: "pack",
        title: "Widen into what you actually watch",
        detail:
          "Pick a title book — Dragon Ball, Death Note, One Piece. Vocabulary sticks when it comes from something you care about, and this is where studying stops feeling like studying.",
        packSlug: "dragon-ball-japanese",
        target: 20,
      },
      {
        kind: "lesson",
        title: "Take a lesson with a tutor",
        detail:
          "A person will hear the things a model cannot: what you avoid saying, what you say too slowly, what you are afraid to try. One lesson at this point is worth a month of cards.",
        target: 1,
      },
    ],
  },
  {
    slug: "french-foundation",
    name: "French from zero",
    language: "French",
    description:
      "Enough French to hold a short conversation in a café and understand the answer — built in the order a beginner can actually follow.",
    steps: [
      {
        kind: "pack",
        title: "Learn the café survival set",
        detail:
          "The phrases you need before you need anything else. Small, concrete, and immediately usable — which is what makes the first week stick.",
        packSlug: "cafe-french",
        target: 15,
      },
      {
        kind: "sentences",
        title: "Drill them in context",
        detail:
          "French word order and liaison are where beginners come apart. Cloze cards make you produce the word inside a real sentence instead of recognising it alone.",
        packSlug: "cafe-french",
        target: 10,
      },
      {
        kind: "chat",
        title: "Order something, in French",
        detail:
          "Tell the tutor to be the waiter and refuse to switch to English. Ten messages of this is worth an hour of review.",
        target: 10,
      },
      {
        kind: "lesson",
        title: "Say it to a person",
        detail:
          "Book a lesson and have the same conversation with a human being. The gap between the two is the thing you are actually training away.",
        target: 1,
      },
    ],
  },
];
