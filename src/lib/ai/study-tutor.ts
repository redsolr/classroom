import OpenAI from "openai";
import type { StudyVocabItem } from "@/db";
import {
  STUDY_TOOL_DEFS,
  type StudyToolExecutor,
} from "@/lib/ai/study-tools";

/**
 * The self-study tutor (/study) — OpenAI-backed, unlike the roster
 * companion (companion.ts, Anthropic): the study surface is the founder's
 * GPT-5.6-tier evaluation ground (2026-08-09 arc). The learner picks the
 * model per message from a fixed roster; requests are validated against
 * it so the client can never name an arbitrary (pricier) model.
 */
const DEFAULT_ROSTER = "gpt-5.6-terra,gpt-5.6-sol,gpt-5.6-luna";

export const STUDY_MODELS: string[] = (
  process.env.STUDY_AI_MODELS ?? DEFAULT_ROSTER
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

/** The composer's preselected model — first roster entry by default. */
export const STUDY_MODEL = process.env.STUDY_AI_MODEL ?? STUDY_MODELS[0];

/**
 * Resolve the model a turn will actually run on. "mock" without a key;
 * roster-validated otherwise (unknown/absent requests fall back to the
 * default). Persisted on the assistant message.
 */
export function resolveStudyModel(requested?: string | null): string {
  if (!process.env.OPENAI_API_KEY) return "mock";
  if (requested && STUDY_MODELS.includes(requested)) return requested;
  return STUDY_MODEL;
}

export type TutorContext = {
  learnerName: string | null;
  /** Null = a generic chat (no tutor persona, no vocab grounding). */
  language: string | null;
  /** The learner's own vocab in this language — grounding material. */
  vocab: Pick<StudyVocabItem, "term" | "reading" | "meaning" | "status">[];
  projectName: string | null;
  /** The project's standing custom instructions, verbatim. */
  projectInstructions: string | null;
  /** The learner's account-level "About you" instructions, verbatim. */
  learnerInstructions: string | null;
  /** Saved memories about the learner — injected into EVERY chat
   * (empty when the learner paused memory). */
  memories: string[];
};

export type TutorTurn = { role: "user" | "assistant"; content: string };

const TUTOR_PROMPT = `You are a personal language tutor inside Classroom's self-study space. The learner studies on their own schedule; you are their always-available practice partner and explainer.

How to tutor:
- Adapt to the learner's level from how they write. Reply mostly in the language they use with you; when they practice the target language, respond in it at a level slightly above theirs, with brief native-language glosses for anything new.
- Correct mistakes briefly and kindly: show the corrected form, a one-line why, then keep the conversation moving. Never lecture.
- Weave the learner's own vocabulary list (provided as context) into your replies and practice prompts — reviewing their words beats introducing random ones.
- When a genuinely useful new word or phrase comes up, mark it on its own line as: VOCAB: term — meaning. Only mark words worth memorizing, at most a couple per reply.
- Keep replies short and conversational (a few sentences, or a compact list when drilling). This is a chat, not a textbook.
- Never invent facts about the learner's history that are not in the context.`;

const GENERIC_PROMPT = `You are the learner's personal assistant inside Classroom's self-study space. This chat is not tied to a language course — help with whatever they bring: writing, planning, questions, thinking things through.

- Be concise and conversational; this is a chat, not a report.
- If the conversation turns into language practice, you may mark a genuinely useful word on its own line as: VOCAB: term — meaning.
- Never invent facts about the learner's history that are not in the context.`;

const TOOLS_PROMPT = `
You also MANAGE the learner's personal vocabulary when asked, via tools:
add_vocab / update_vocab / delete_vocab / list_vocab, and their lists via
create_vocab_list / add_to_vocab_list / remove_from_vocab_list. Use them
whenever the learner asks to save, change, remove, or organize words —
never claim you saved something without calling the tool. Fill in a
sensible meaning/reading/category yourself when the learner doesn't give
one. After a tool call, confirm in one short sentence what changed.

You also keep long-term MEMORY about the learner across conversations:
- When the learner shares a durable fact about themselves — goals, exam
  dates, level, interests, how they like to learn, what they struggle
  with — save it with the remember tool as one short third-person
  sentence. Also save when they explicitly ask you to remember something.
- When they ask you to forget something, call forget_memory.
- Never save secrets, passwords, or sensitive personal data (health,
  finances, precise location). Never recite the memory list unprompted —
  just use it to personalize your replies.`;

function renderTutorContext(ctx: TutorContext): string {
  const lines = [`Learner: ${ctx.learnerName ?? "(no name given)"}`];
  if (ctx.language) {
    lines.push(`Studying: ${ctx.language}`);
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
  }
  return lines.join("\n");
}

/** Full instructions block: persona + tools + learner context + project rules. */
function buildInstructions(ctx: TutorContext): string {
  const parts = [
    (ctx.language ? TUTOR_PROMPT : GENERIC_PROMPT) + TOOLS_PROMPT,
    `<learner_context>\n${renderTutorContext(ctx)}\n</learner_context>`,
  ];
  if (ctx.learnerInstructions?.trim()) {
    parts.push(
      `<learner_instructions>\nThe learner set these standing instructions on their account — follow them in every reply:\n${ctx.learnerInstructions.trim()}\n</learner_instructions>`,
    );
  }
  if (ctx.memories.length > 0) {
    parts.push(
      `<learner_memory>\nThings you know about this learner from previous conversations (saved memories, oldest first):\n${ctx.memories
        .map((m) => `- ${m}`)
        .join("\n")}\n</learner_memory>`,
    );
  }
  if (ctx.projectInstructions?.trim()) {
    parts.push(
      `<project_instructions>\nThe learner set these standing instructions for the "${ctx.projectName ?? "project"}" project — follow them in every reply:\n${ctx.projectInstructions.trim()}\n</project_instructions>`,
    );
  }
  return parts.join("\n\n");
}

/**
 * Deterministic fallback when no OPENAI_API_KEY is configured — keeps
 * local dev and e2e free and offline, and demonstrably grounded: it
 * references the learner's own vocabulary.
 */
function mockTutorReply(ctx: TutorContext, message: string): string {
  // The e2e suite's probes that standing instructions actually reach
  // the prompt assembly — the real model gets them in
  // <project_instructions> / <learner_instructions>.
  const instructionsTail =
    (ctx.projectInstructions?.trim()
      ? "\n(Following your project instructions.)"
      : "") +
    (ctx.learnerInstructions?.trim()
      ? "\n(Following your standing instructions.)"
      : "");

  if (!ctx.language) {
    return `Hi${ctx.learnerName ? ` ${ctx.learnerName}` : ""}! You said: “${message.slice(0, 80)}”. Happy to help with anything.${instructionsTail}`;
  }

  const intro = `Bienvenue${ctx.learnerName ? `, ${ctx.learnerName}` : ""}! Let's practice your ${ctx.language}.`;
  const vocab = ctx.vocab[0];
  if (vocab) {
    return `${intro} Try using “${vocab.term}”${vocab.meaning ? ` (${vocab.meaning})` : ""} in a sentence.${instructionsTail}`;
  }
  // VOCAB suggestions live on their own line — same convention the system
  // prompt demands of the real model (that's what the chip parser reads).
  return `${intro} You said: “${message.slice(0, 80)}”. A good word to start your list with:${instructionsTail}\nVOCAB: bonjour — hello`;
}

/**
 * Deterministic tool commands for the offline mock — same executor the
 * real model calls, so e2e proves chat → DB for real. Grammar:
 *   add vocab: term — meaning
 *   update vocab: term — new meaning
 *   delete vocab: term
 *   list my vocab
 *   remember: fact
 *   forget memory: fact
 *   what do you remember        (reads the INJECTED context, not the DB —
 *                                the probe that memories reach the prompt)
 */
async function mockToolTurn(
  ctx: TutorContext,
  message: string,
  execute: StudyToolExecutor,
): Promise<string | null> {
  const dash = /\s*(?:—|–|-)\s*/;
  const add = new RegExp(`^add vocab:\\s*(.+?)${dash.source}(.+)$`, "i").exec(
    message,
  );
  if (add) {
    const result = JSON.parse(
      await execute("add_vocab", { term: add[1], meaning: add[2] }),
    ) as { saved?: boolean; reason?: string; error?: string };
    if (result.error) return result.error;
    if (result.saved === false && result.reason === "already_saved") {
      return `“${add[1]}” is already on your list.`;
    }
    return `Done — added “${add[1]}” (${add[2]}) to your ${ctx.language ?? ""} vocabulary.`;
  }
  const update = new RegExp(
    `^update vocab:\\s*(.+?)${dash.source}(.+)$`,
    "i",
  ).exec(message);
  if (update) {
    const result = JSON.parse(
      await execute("update_vocab", { term: update[1], meaning: update[2] }),
    ) as { updated?: boolean; error?: string };
    return result.error ?? `Updated “${update[1]}” — it now means “${update[2]}”.`;
  }
  const del = /^delete vocab:\s*(.+)$/i.exec(message);
  if (del) {
    const result = JSON.parse(
      await execute("delete_vocab", { term: del[1] }),
    ) as { deleted?: boolean; error?: string };
    return result.error ?? `Removed “${del[1]}” from your vocabulary.`;
  }
  if (/^list my vocab/i.test(message)) {
    const result = JSON.parse(await execute("list_vocab", {})) as {
      count: number;
      words: { term: string }[];
    };
    return result.count === 0
      ? "Your vocabulary list is empty."
      : `You have ${result.count} saved word${result.count === 1 ? "" : "s"}: ${result.words.map((w) => w.term).join(", ")}.`;
  }
  const remember = /^remember:\s*(.+)$/i.exec(message);
  if (remember) {
    const result = JSON.parse(
      await execute("remember", { fact: remember[1] }),
    ) as { saved?: boolean; reason?: string; error?: string };
    if (result.error) return result.error;
    if (result.saved === false && result.reason === "already_saved") {
      return "I already have that saved.";
    }
    return "Got it — I'll remember that.";
  }
  const forget = /^forget memory:\s*(.+)$/i.exec(message);
  if (forget) {
    const result = JSON.parse(
      await execute("forget_memory", { fact: forget[1] }),
    ) as { forgotten?: string; error?: string };
    return result.error ?? `Forgotten: “${result.forgotten}”.`;
  }
  if (/^what do you remember/i.test(message)) {
    // Answers from the injected context, NOT the DB — proving the
    // memories actually reached this turn's prompt assembly.
    return ctx.memories.length === 0
      ? "I don't have any memories saved about you yet."
      : `Here's what I remember about you: ${ctx.memories.join(" · ")}`;
  }
  return null;
}

/** How many tool-call → tool-result rounds one turn may take. */
const MAX_TOOL_ROUNDS = 5;

/**
 * Stream the tutor's reply as text deltas. The caller owns persistence —
 * it accumulates the full text and stores it when the stream ends.
 * With `executeTool`, the model gets the vocabulary CRUD tools; calls
 * are executed between streaming rounds (Responses API
 * previous_response_id chaining) until a round produces no calls.
 */
export async function* streamTutorReply(
  ctx: TutorContext,
  history: TutorTurn[],
  message: string,
  options: { model: string; executeTool?: StudyToolExecutor },
): AsyncGenerator<string> {
  const model = options.model;
  if (model === "mock" || !process.env.OPENAI_API_KEY) {
    if (options.executeTool) {
      const toolReply = await mockToolTurn(ctx, message, options.executeTool);
      if (toolReply !== null) {
        yield toolReply;
        return;
      }
    }
    yield mockTutorReply(ctx, message);
    return;
  }

  const client = new OpenAI();
  let input: OpenAI.Responses.ResponseInput = [
    ...history,
    { role: "user" as const, content: message },
  ];
  let previousResponseId: string | undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await client.responses.create({
      model,
      stream: true,
      max_output_tokens: 1200,
      instructions: buildInstructions(ctx),
      input,
      ...(options.executeTool ? { tools: STUDY_TOOL_DEFS } : {}),
      ...(previousResponseId
        ? { previous_response_id: previousResponseId }
        : {}),
    });

    const calls: { callId: string; name: string; args: string }[] = [];
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        yield event.delta;
      } else if (event.type === "response.completed") {
        previousResponseId = event.response.id;
        for (const item of event.response.output) {
          if (item.type === "function_call") {
            calls.push({
              callId: item.call_id,
              name: item.name,
              args: item.arguments,
            });
          }
        }
      }
    }

    if (calls.length === 0 || !options.executeTool) return;

    // Execute this round's calls and hand the results back as the next
    // round's only input (the conversation so far rides on
    // previous_response_id).
    const outputs: OpenAI.Responses.ResponseInputItem.FunctionCallOutput[] = [];
    for (const call of calls) {
      let parsedArgs: unknown = {};
      try {
        parsedArgs = JSON.parse(call.args) as unknown;
      } catch (error) {
        console.error("study tutor: unparsable tool arguments", error);
      }
      outputs.push({
        type: "function_call_output",
        call_id: call.callId,
        output: await options.executeTool(call.name, parsedArgs),
      });
    }
    input = outputs;
  }
}
