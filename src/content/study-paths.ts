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
 * ── The three limbs ────────────────────────────────────────────────
 *
 * `/path` draws these as a skill tree with three branches, and the
 * branch a step lands on is DERIVED FROM ITS KIND (see
 * `lib/study-path-tree.ts`) rather than declared here:
 *
 *   pack        → VOCABULARY
 *   sentences   → GRAMMAR
 *   chat/lesson → CONVERSATION
 *
 * So authoring a path is authoring three limbs at once, and the thing to
 * watch when editing this file is BALANCE: a path with six pack steps
 * and one chat step draws as a lopsided tree, which is an accurate
 * picture of a curriculum that would leave someone unable to speak.
 *
 * Steps deliberately mix card work with human work for that reason. A
 * path that is only flashcards teaches someone to recognise words they
 * have never once said out loud, and every learner who has done that
 * knows the feeling of freezing in a real conversation.
 *
 * `packSlug` must match a slug in `study-packs.ts`, and `target` must be
 * reachable from that pack's own word count — `seed-paths.ts` fails
 * loudly on either rather than shipping a node that can never light up.
 */

export type PathStepContent = {
  kind: "pack" | "sentences" | "chat" | "lesson";
  title: string;
  detail: string;
  /** The official book this step is about (pack + sentences steps). */
  packSlug?: string;
  /**
   * What counts as done, in the step's own unit — words known for a
   * pack, cards known for sentences, messages for a chat, lessons
   * attended for a lesson. Completion is derived from that evidence.
   *
   * For pack and sentence steps this must be ≤ the pack's word count:
   * a target of 20 against a 15-word book is a node the learner can
   * never complete, which is worse than no node at all. The seed
   * enforces it.
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
        target: 10,
      },
      {
        kind: "sentences",
        title: "Put those words in sentences",
        detail:
          "Recognising a word is not knowing it. Cloze cards ask whether you can still supply it when a sentence needs it — which is the thing that transfers to speaking.",
        packSlug: "anime-essentials-japanese",
        target: 8,
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
          "Dragon Ball, or any title book you like better. Vocabulary sticks when it comes from something you care about, and this is where studying stops feeling like studying.",
        packSlug: "dragon-ball-japanese",
        target: 12,
      },
      {
        kind: "sentences",
        title: "Same words, harder sentences",
        detail:
          "The second round of cloze cards is where the gap shows: words you were sure of at the flashcard stage go missing the moment a sentence has to be finished around them.",
        packSlug: "dragon-ball-japanese",
        target: 8,
      },
      {
        kind: "chat",
        title: "Hold a longer conversation",
        detail:
          "Ten messages is a demo; forty is a conversation. Ask the tutor to stop switching to English and to correct you as you go rather than at the end.",
        target: 40,
      },
      {
        kind: "lesson",
        title: "Take a lesson with a tutor",
        detail:
          "A person hears what a model cannot: what you avoid saying, what you say too slowly, what you are afraid to try. One lesson at this point is worth a month of cards.",
        target: 1,
      },
      {
        kind: "pack",
        title: "Add the words you meet in games",
        detail:
          "Menus, saves, items, damage. Unglamorous and constantly on screen, which makes them some of the highest-frequency words you will ever learn.",
        packSlug: "gaming-japanese",
        target: 10,
      },
      {
        kind: "sentences",
        title: "Produce them without the prompt",
        detail:
          "Cards from the gaming book, drilled the hard way round. By now the point is not new words — it is closing the gap between recognising and reaching for.",
        packSlug: "gaming-japanese",
        target: 8,
      },
      {
        kind: "pack",
        title: "Take on a full title book",
        detail:
          "One Piece, with nothing propping it up. A whole book at this stage is the honest test of whether the first three stuck.",
        packSlug: "one-piece-japanese",
        target: 12,
      },
      {
        kind: "lesson",
        title: "Make the lessons a habit",
        detail:
          "Four lessons, not one. The first tells you where you are; it is the fourth that changes how you sound, because by then someone knows your habits well enough to interrupt them.",
        target: 4,
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
        target: 8,
      },
      {
        kind: "sentences",
        title: "Drill them in context",
        detail:
          "French word order and liaison are where beginners come apart. Cloze cards make you produce the word inside a real sentence instead of recognising it alone.",
        packSlug: "cafe-french",
        target: 8,
      },
      {
        kind: "chat",
        title: "Order something, in French",
        detail:
          "Tell the tutor to be the waiter and to refuse to switch to English. Ten messages of this is worth an hour of review.",
        target: 10,
      },
      {
        kind: "pack",
        title: "Finish the book",
        detail:
          "Every word in Café survival French, not just the ones that came easily. A book you half-know is the one that fails you at the counter.",
        packSlug: "cafe-french",
        target: 12,
      },
      {
        kind: "sentences",
        title: "Every word you own, in a sentence",
        detail:
          "The second pass over the same book. Same words, and the only thing being tested is whether you can supply them under a little pressure.",
        packSlug: "cafe-french",
        target: 12,
      },
      {
        kind: "chat",
        title: "Keep going past the first exchange",
        detail:
          "The hard part of a real café is not the order, it is the reply you did not plan for. Thirty messages is roughly where that stops being alarming.",
        target: 30,
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
