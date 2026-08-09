import OpenAI from "openai";
import { z } from "zod";
import { STUDY_MODEL } from "./study-tutor";

/**
 * Chat→vocab bulk extraction: read a whole study conversation and
 * propose the vocabulary worth keeping. Extraction only PROPOSES — the
 * learner reviews the candidates in a dialog and picks what to save
 * (the app's "AI never writes directly" rule, applied to the learner's
 * own list).
 */

export type VocabCandidate = {
  term: string;
  reading: string | null;
  meaning: string | null;
};

export type ExtractTurn = { role: "user" | "assistant"; content: string };

const MAX_CANDIDATES = 30;

const candidatesSchema = z.object({
  items: z
    .array(
      z.object({
        term: z.string().trim().min(1).max(200),
        reading: z.string().trim().max(200).nullable(),
        meaning: z.string().trim().max(500).nullable(),
      }),
    )
    .max(MAX_CANDIDATES),
});

const EXTRACT_PROMPT = `You extract vocabulary from a language-study conversation for the learner's personal flashcard list.

Rules:
- Extract words and short phrases in the TARGET language that the learner encountered, practiced, was corrected on, or asked about — the material worth memorizing from THIS conversation.
- term = the word/phrase in the target language. reading = pronunciation aid (furigana, romaji, pinyin, IPA) when the script needs one, else null. meaning = a concise gloss in the language the learner uses to communicate, else null.
- Skip words already on the learner's list (provided below). Skip trivial words the conversation shows the learner already knows well.
- Quality over quantity: only items worth a flashcard. Return an empty list when nothing qualifies.`;

/**
 * Deterministic offline fallback: collect the conversation's un-saved
 * \`VOCAB: term — meaning\` suggestion lines (the same line convention
 * the tutor prompt demands and the chip parser in study-chat.tsx reads).
 */
export function mockExtractVocab(turns: ExtractTurn[]): VocabCandidate[] {
  const seen = new Set<string>();
  const out: VocabCandidate[] = [];
  for (const turn of turns) {
    if (turn.role !== "assistant") continue;
    for (const line of turn.content.split("\n")) {
      const match = /^\s*VOCAB:\s*(.+?)\s*[—–-]\s*(.+)\s*$/.exec(line);
      if (!match) continue;
      const key = match[1].toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ term: match[1], reading: null, meaning: match[2] });
    }
  }
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * Extract candidates from a conversation. Real model when a key is
 * configured, the deterministic mock otherwise (dev/e2e stay offline).
 * The caller dedups against the learner's saved list either way — the
 * prompt asks the model to skip known words, but that is a request, not
 * a guarantee.
 */
export async function extractVocabCandidates(
  language: string,
  turns: ExtractTurn[],
  knownTerms: string[],
): Promise<VocabCandidate[]> {
  if (!process.env.OPENAI_API_KEY) {
    return mockExtractVocab(turns);
  }

  const transcript = turns
    .map((t) => `${t.role === "user" ? "Learner" : "Tutor"}: ${t.content}`)
    .join("\n\n");

  const response = await new OpenAI().responses.create({
    model: STUDY_MODEL,
    max_output_tokens: 2000,
    instructions: EXTRACT_PROMPT,
    input: `Target language: ${language}\n\nAlready on the learner's list (skip these): ${
      knownTerms.length > 0 ? knownTerms.join(", ") : "(nothing yet)"
    }\n\nConversation:\n${transcript}`,
    text: {
      format: {
        type: "json_schema",
        name: "vocab_extraction",
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
                required: ["term", "reading", "meaning"],
                properties: {
                  term: { type: "string" },
                  reading: { type: ["string", "null"] },
                  meaning: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
    },
  });

  // Validate rather than trust: a malformed reply must fail loudly, not
  // seed the learner's list with junk.
  const parsed = candidatesSchema.parse(
    JSON.parse(response.output_text) as unknown,
  );
  return parsed.items.map((item) => ({
    term: item.term,
    reading: item.reading || null,
    meaning: item.meaning || null,
  }));
}
