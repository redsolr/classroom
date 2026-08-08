import OpenAI from "openai";
import type { StudyVocabItem } from "@/db";

/**
 * The self-study tutor (/study) — OpenAI-backed, unlike the roster
 * companion (companion.ts, Anthropic): the study surface is the founder's
 * Terra/Sol evaluation ground (2026-08-09 arc). Terra answers by default;
 * "think harder" escalates a single turn to Sol.
 */
export const STUDY_MODEL = process.env.STUDY_AI_MODEL ?? "gpt-5.6-terra";
export const STUDY_MODEL_MAX =
  process.env.STUDY_AI_MODEL_MAX ?? "gpt-5.6-sol";

export type TutorContext = {
  learnerName: string | null;
  language: string;
  /** The learner's own vocab in this language — grounding material. */
  vocab: Pick<StudyVocabItem, "term" | "reading" | "meaning" | "status">[];
};

export type TutorTurn = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are a personal language tutor inside Class-room's self-study space. The learner studies on their own schedule; you are their always-available practice partner and explainer.

How to tutor:
- Adapt to the learner's level from how they write. Reply mostly in the language they use with you; when they practice the target language, respond in it at a level slightly above theirs, with brief native-language glosses for anything new.
- Correct mistakes briefly and kindly: show the corrected form, a one-line why, then keep the conversation moving. Never lecture.
- Weave the learner's own vocabulary list (provided as context) into your replies and practice prompts — reviewing their words beats introducing random ones.
- When a genuinely useful new word or phrase comes up, mark it on its own line as: VOCAB: term — meaning. Only mark words worth memorizing, at most a couple per reply.
- Keep replies short and conversational (a few sentences, or a compact list when drilling). This is a chat, not a textbook.
- Never invent facts about the learner's history that are not in the context.`;

function renderTutorContext(ctx: TutorContext): string {
  const lines = [
    `Learner: ${ctx.learnerName ?? "(no name given)"}`,
    `Studying: ${ctx.language}`,
  ];
  if (ctx.vocab.length > 0) {
    lines.push(
      `Their current vocabulary list (${ctx.vocab.length} shown): ${ctx.vocab
        .map((v) => {
          const reading = v.reading ? ` [${v.reading}]` : "";
          const meaning = v.meaning ? ` = ${v.meaning}` : "";
          return `${v.term}${reading}${meaning} (${v.status})`;
        })
        .join("; ")}`,
    );
  } else {
    lines.push(
      "Their vocabulary list is empty — suggest starting one from this conversation.",
    );
  }
  return lines.join("\n");
}

/**
 * Deterministic fallback when no OPENAI_API_KEY is configured — keeps
 * local dev and e2e free and offline, and demonstrably grounded: it
 * references the learner's own vocabulary.
 */
function mockTutorReply(ctx: TutorContext, message: string): string {
  const intro = `Bienvenue${ctx.learnerName ? `, ${ctx.learnerName}` : ""}! Let's practice your ${ctx.language}.`;
  const vocab = ctx.vocab[0];
  if (vocab) {
    return `${intro} Try using “${vocab.term}”${vocab.meaning ? ` (${vocab.meaning})` : ""} in a sentence.`;
  }
  // VOCAB suggestions live on their own line — same convention the system
  // prompt demands of the real model (that's what the chip parser reads).
  return `${intro} You said: “${message.slice(0, 80)}”. A good word to start your list with:\nVOCAB: bonjour — hello`;
}

/**
 * Stream the tutor's reply as text deltas. The caller owns persistence —
 * it accumulates the full text and stores it when the stream ends.
 */
export async function* streamTutorReply(
  ctx: TutorContext,
  history: TutorTurn[],
  message: string,
  options: { boost?: boolean } = {},
): AsyncGenerator<string> {
  if (!process.env.OPENAI_API_KEY) {
    yield mockTutorReply(ctx, message);
    return;
  }

  const model = options.boost ? STUDY_MODEL_MAX : STUDY_MODEL;
  const client = new OpenAI();
  const stream = await client.responses.create({
    model,
    stream: true,
    max_output_tokens: 1200,
    instructions: `${SYSTEM_PROMPT}\n\n<learner_context>\n${renderTutorContext(ctx)}\n</learner_context>`,
    input: [...history, { role: "user" as const, content: message }],
  });

  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      yield event.delta;
    }
  }
}

/** Which model name a turn will run on — persisted with the message. */
export function tutorModelFor(boost: boolean): string {
  if (!process.env.OPENAI_API_KEY) return "mock";
  return boost ? STUDY_MODEL_MAX : STUDY_MODEL;
}
