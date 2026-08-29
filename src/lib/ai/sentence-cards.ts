import OpenAI from "openai";
import { z } from "zod";
import { markCloze } from "@/lib/cloze";
import { STUDY_MODEL } from "./study-tutor";

/**
 * Sentence-card generation: turn words the learner already owns into
 * cloze sentences that test the word IN CONTEXT.
 *
 * Almost nobody writes cloze cards by hand — that's the whole reason
 * Anki users don't have them, and the whole reason this is worth doing
 * for them. The model writes the sentence and names the target word
 * SEPARATELY; we place the blank ourselves with markCloze, so a model
 * that mangles the `{{…}}` syntax can't produce a broken card — it
 * produces no card, loudly.
 */

export type SentenceSeed = {
  term: string;
  reading: string | null;
  meaning: string | null;
};

export type GeneratedSentence = {
  /** Cloze text: exactly one `{{…}}` span. */
  text: string;
  translation: string;
  note: string | null;
  /** The seed word this was built around. */
  term: string;
};

const MAX_CARDS = 20;

const modelSentenceSchema = z.object({
  term: z.string().trim().min(1).max(200),
  sentence: z.string().trim().min(1).max(400),
  translation: z.string().trim().min(1).max(400),
  note: z.string().trim().max(300).nullable(),
});

const modelReplySchema = z.object({
  items: z.array(modelSentenceSchema).max(MAX_CARDS),
});

const PROMPT = `You write cloze flashcards that test whether a learner really understands a word in context.

For each word you are given, write ONE natural sentence in that word's language that uses it.

Rules:
- The sentence must make the word LOAD-BEARING: a reader who doesn't know it should not be able to guess the blank from the rest of the sentence alone. Avoid sentences where any word of that class would fit.
- Keep it short enough to hold in your head — roughly 6 to 15 words — and natural, the way a native speaker would actually say it.
- "term" must be the word EXACTLY as it appears inside your sentence (same conjugation, same script). If the sentence conjugates or inflects it, term is the inflected form that is literally present.
- "translation" = the whole sentence, rendered in the language the learner uses to communicate.
- "note" = one short usage or grammar aside if it genuinely helps, else null. Never restate the translation.
- Skip any word you cannot write a good sentence for. Fewer, better cards.`;

/**
 * Deterministic offline generator — dev and e2e run with no key, and a
 * study feature that only works with an API key is untestable.
 *
 * Honest about being a stand-in: the sentence is a frame around the
 * word rather than real prose, but it exercises the whole pipeline
 * (cloze placement, storage, drill, scheduling) end to end.
 */
export function mockGenerateSentences(
  seeds: SentenceSeed[],
): GeneratedSentence[] {
  return seeds.slice(0, MAX_CARDS).flatMap((seed) => {
    const sentence = `${seed.term} — ${seed.meaning ?? "?"}`;
    const text = markCloze(sentence, seed.term);
    if (!text) return [];
    return [
      {
        text,
        translation: seed.meaning
          ? `Practice sentence for "${seed.meaning}".`
          : `Practice sentence for "${seed.term}".`,
        note: seed.reading,
        term: seed.term,
      },
    ];
  });
}

/**
 * Build cloze cards for the given words. Real model when a key is
 * configured, the deterministic mock otherwise.
 *
 * A returned card is guaranteed to carry exactly one blank around a
 * span that is actually present in the sentence: anything the model
 * returns whose "term" isn't in its own sentence is DROPPED, not
 * patched. A cloze card with the blank in the wrong place teaches the
 * wrong thing, which is worse than one fewer card.
 */
export async function generateSentenceCards(
  language: string,
  seeds: SentenceSeed[],
): Promise<GeneratedSentence[]> {
  if (seeds.length === 0) return [];
  if (!process.env.OPENAI_API_KEY) return mockGenerateSentences(seeds);

  const wordList = seeds
    .map((s) =>
      [s.term, s.reading && `[${s.reading}]`, s.meaning && `— ${s.meaning}`]
        .filter(Boolean)
        .join(" "),
    )
    .join("\n");

  const response = await new OpenAI().responses.create({
    model: STUDY_MODEL,
    max_output_tokens: 3000,
    instructions: PROMPT,
    input: `Language: ${language}\n\nWords:\n${wordList}`,
    text: {
      format: {
        type: "json_schema",
        name: "sentence_cards",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["items"],
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["term", "sentence", "translation", "note"],
                properties: {
                  term: { type: "string" },
                  sentence: { type: "string" },
                  translation: { type: "string" },
                  note: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
    },
  });

  // Validate rather than trust — a malformed reply fails loudly instead
  // of seeding the learner's deck with junk.
  const parsed = modelReplySchema.parse(
    JSON.parse(response.output_text) as unknown,
  );

  return parsed.items.flatMap((item) => {
    const text = markCloze(item.sentence, item.term);
    if (!text) {
      console.warn(
        `sentence cards: dropped a card — "${item.term}" is not in its own sentence`,
      );
      return [];
    }
    return [
      {
        text,
        translation: item.translation,
        note: item.note || null,
        term: item.term,
      },
    ];
  });
}
