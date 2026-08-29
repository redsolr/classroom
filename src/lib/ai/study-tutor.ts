import OpenAI from "openai";
import type { StudyVocabItem } from "@/db";
import {
  STUDY_TOOL_DEFS,
  type StudyToolExecutor,
} from "@/lib/ai/study-tools";
import { STUDY_LANGUAGES } from "@/lib/study-languages";

/**
 * The self-study tutor (/chat) — OpenAI-backed, unlike the roster
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

/** The roster every chat mount offers, with the default guaranteed
 * present (STUDY_AI_MODEL may name a model outside STUDY_AI_MODELS). */
export const STUDY_MODEL_ROSTER: string[] = STUDY_MODELS.includes(STUDY_MODEL)
  ? STUDY_MODELS
  : [STUDY_MODEL, ...STUDY_MODELS];

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
  /** A default language for FILING words (legacy project value or a
   * language thread) — behavior never forks on it; instructions do. */
  language: string | null;
  /** The learner's own vocabulary — grounding material in EVERY chat
   * (scoped to `language` when one is set, recent across languages
   * otherwise). */
  vocab: Pick<
    StudyVocabItem,
    "term" | "reading" | "meaning" | "status" | "language"
  >[];
  projectName: string | null;
  /** The project's standing custom instructions, verbatim. */
  projectInstructions: string | null;
  /** The learner's account-level "About you" instructions, verbatim. */
  learnerInstructions: string | null;
  /** Saved memories about the learner — injected into EVERY chat
   * (empty when the learner paused memory). */
  memories: string[];
  /** The library book this chat is attached to (with the learner's
   * notes on it) — null for ordinary chats. */
  book: {
    title: string;
    author: string | null;
    summary: string | null;
    notes: string[];
  } | null;
  /** The learner's reading library index — injected into EVERY chat so
   * "what did I read about X?" works anywhere; details via list_notes. */
  library: { title: string; author: string | null; summary: string | null }[];
};

export type TutorTurn = { role: "user" | "assistant"; content: string };

/**
 * ONE prompt for every chat (2026-08-14 generic-projects refactor):
 * what a chat is FOR comes from the learner's instructions and the
 * conversation itself, never from a project "language mode". The
 * tutoring guidance simply activates when the conversation is language
 * practice — the same way it would for a human tutor-assistant.
 */
const STUDY_PROMPT = `You are the learner's personal study partner inside Classroom's self-study space — tutor, explainer, and assistant in one. Help with whatever they bring: language practice, reading, writing, planning, thinking things through. The learner's standing instructions (account-level and per-project, provided below when set) define what a chat is for — follow them.

- Be concise and conversational; this is a chat, not a report.
- Never invent facts about the learner's history that are not in the context.

When the conversation is language practice:
- Adapt to the learner's level from how they write. Reply mostly in the language they use with you; when they practice a target language, respond in it at a level slightly above theirs, with brief glosses for anything new.
- Correct mistakes briefly and kindly: show the corrected form, a one-line why, then keep the conversation moving. Never lecture.
- Weave the learner's own vocabulary (provided as context) into your replies and practice prompts — reviewing their words beats introducing random ones.
- When a genuinely useful new word or phrase comes up, mark it on its own line as: VOCAB: term — meaning — Language (the language of the term, from this fixed set: ${STUDY_LANGUAGES.join(", ")}). Only mark words worth memorizing, at most a couple per reply.`;

const TOOLS_PROMPT = `
You also MANAGE the learner's personal vocabulary when asked, via tools:
add_vocab / update_vocab / delete_vocab / list_vocab, and their lists via
create_vocab_list / add_to_vocab_list / remove_from_vocab_list. Use them
whenever the learner asks to save, change, remove, or organize words —
never claim you saved something without calling the tool. Fill in a
sensible meaning/reading/category yourself when the learner doesn't give
one. After a tool call, confirm in one short sentence what changed.

You also manage the learner's READING LIBRARY — books and articles they
read, each holding their atomic notes/takeaways — via tools: add_book /
save_note / list_notes / delete_note.
- When the learner shares takeaways from something they read, save each
  distinct idea as its OWN short note with save_note (in a chat attached
  to a book it files there automatically; otherwise name the book, or
  omit it for a loose note). A pasted brain-dump becomes several clean
  notes, one per idea.
- When they ask what they read or learned about a topic, recall with
  list_notes rather than guessing.
- Never claim you saved a note or book without calling the tool.

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
    lines.push(`This chat files vocabulary under: ${ctx.language}`);
  }
  // Vocabulary grounds EVERY chat now — each entry is labeled with its
  // own language, so nothing depends on a chat-level mode.
  if (ctx.vocab.length > 0) {
    lines.push(
      `Their current vocabulary (${ctx.vocab.length} shown): ${ctx.vocab
        .map((v) => {
          const reading = v.reading ? ` [${v.reading}]` : "";
          const meaning = v.meaning ? ` = ${v.meaning}` : "";
          return `${v.term}${reading}${meaning} (${v.language}, ${v.status})`;
        })
        .join("; ")}`,
    );
  } else {
    lines.push(
      "Their vocabulary list is empty — when language practice comes up, suggest starting one from the conversation.",
    );
  }
  return lines.join("\n");
}

/** Full instructions block: persona + tools + learner context + project rules. */
function buildInstructions(ctx: TutorContext): string {
  const parts = [
    STUDY_PROMPT + TOOLS_PROMPT,
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
  if (ctx.book) {
    const bookLines = [
      `This chat is attached to “${ctx.book.title}”${ctx.book.author ? ` by ${ctx.book.author}` : ""} from the learner's reading library — discuss it, help them apply its ideas, and file new takeaways here with save_note.`,
    ];
    if (ctx.book.summary?.trim()) {
      bookLines.push(`Summary: ${ctx.book.summary.trim()}`);
    }
    bookLines.push(
      ctx.book.notes.length > 0
        ? `The learner's notes on it so far:\n${ctx.book.notes.map((n) => `- ${n}`).join("\n")}`
        : "The learner has no notes on it yet.",
    );
    parts.push(`<book_context>\n${bookLines.join("\n")}\n</book_context>`);
  }
  if (ctx.library.length > 0) {
    parts.push(
      `<library>\nThe learner's reading library (their notes are readable via list_notes):\n${ctx.library
        .map(
          (b) =>
            `- ${b.title}${b.author ? ` — ${b.author}` : ""}${b.summary ? `: ${b.summary}` : ""}`,
        )
        .join("\n")}\n</reading>`,
    );
  }
  return parts.join("\n\n");
}

/**
 * Deterministic fallback when no OPENAI_API_KEY is configured — keeps
 * local dev and e2e free and offline. Keyed on MESSAGE content, never
 * on a chat-level language mode (there is none anymore): the word in
 * the message decides the behavior, mirroring how the real model infers
 * language from the conversation. Probes:
 *   "drill me"          → drills the first injected vocab item — the
 *                         probe that vocabulary reaches EVERY chat
 *   contains "bonjour"  → VOCAB chip line carrying its own language
 *   contains "merci"    → a second chip word (extraction round-trips)
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

  if (/^drill me/i.test(message)) {
    const vocab = ctx.vocab[0];
    return vocab
      ? `Try using “${vocab.term}”${vocab.meaning ? ` (${vocab.meaning})` : ""} in a sentence.${instructionsTail}`
      : `Your vocabulary list is empty — save a word and I'll drill you on it.${instructionsTail}`;
  }
  if (/bonjour/i.test(message)) {
    // VOCAB suggestions live on their own line and carry their own
    // language — same convention the system prompt demands of the real
    // model (that's what the chip parser reads).
    return `Bienvenue${ctx.learnerName ? `, ${ctx.learnerName}` : ""}! You said: “${message.slice(0, 80)}”. A good word to start your list with:${instructionsTail}\nVOCAB: bonjour — hello — French`;
  }
  if (/merci/i.test(message)) {
    return `De rien! A word worth keeping from this:${instructionsTail}\nVOCAB: merci — thank you — French`;
  }
  return `Hi${ctx.learnerName ? ` ${ctx.learnerName}` : ""}! You said: “${message.slice(0, 80)}”. Happy to help with anything.${instructionsTail}`;
}

/**
 * Deterministic tool commands for the offline mock — same executor the
 * real model calls, so e2e proves chat → DB for real. Grammar:
 *   add vocab: term — meaning[ — language]
 *   update vocab: term — new meaning
 *   delete vocab: term
 *   list my vocab
 *   remember: fact
 *   forget memory: fact
 *   what do you remember        (reads the INJECTED context, not the DB —
 *                                the probe that memories reach the prompt)
 *   add book: Title — summary
 *   save note to Title: content
 *   save note: content          (files to the chat's linked book, if any)
 *   list notes
 *   delete note: fragment
 *   what are we reading         (reads ctx.book — the probe that book
 *                                context reaches a book chat's prompt)
 *   what have i read            (reads ctx.library — the probe that the
 *                                library index reaches EVERY chat)
 */
async function mockToolTurn(
  ctx: TutorContext,
  message: string,
  execute: StudyToolExecutor,
): Promise<string | null> {
  const dash = /\s*(?:—|–|-)\s*/;
  const add = new RegExp(
    `^add vocab:\\s*(.+?)${dash.source}(.+?)(?:${dash.source}([^—–-]+?))?$`,
    "i",
  ).exec(message);
  if (add) {
    const result = JSON.parse(
      await execute("add_vocab", {
        term: add[1],
        meaning: add[2],
        ...(add[3] ? { language: add[3].trim() } : {}),
      }),
    ) as { saved?: boolean; reason?: string; error?: string };
    if (result.error) return result.error;
    if (result.saved === false && result.reason === "already_saved") {
      return `“${add[1]}” is already on your list.`;
    }
    return `Done — added “${add[1]}” (${add[2]}) to your vocabulary.`;
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
  const addBook = new RegExp(
    `^add book:\\s*(.+?)${dash.source}(.+)$`,
    "i",
  ).exec(message);
  if (addBook) {
    const result = JSON.parse(
      await execute("add_book", { title: addBook[1], summary: addBook[2] }),
    ) as { saved?: boolean; reason?: string; error?: string };
    if (result.error) return result.error;
    if (result.saved === false && result.reason === "already_saved") {
      return `“${addBook[1]}” is already in your library.`;
    }
    return `Added “${addBook[1]}” to your library.`;
  }
  const noteTo = /^save note to\s+(.+?):\s*(.+)$/i.exec(message);
  const note = noteTo ?? /^save note:\s*(.+)$/i.exec(message);
  if (note) {
    const args = noteTo
      ? { note: noteTo[2], book: noteTo[1] }
      : { note: note[1] };
    const result = JSON.parse(await execute("save_note", args)) as {
      saved?: boolean;
      book?: string | null;
      error?: string;
    };
    if (result.error) return result.error;
    return result.book
      ? `Noted — saved to “${result.book === "this book" ? (ctx.book?.title ?? "this book") : result.book}”.`
      : "Noted — saved as a loose note.";
  }
  if (/^list notes/i.test(message)) {
    const result = JSON.parse(await execute("list_notes", {})) as {
      count: number;
      notes: { content: string; book: string | null }[];
    };
    return result.count === 0
      ? "You have no saved notes yet."
      : `You have ${result.count} note${result.count === 1 ? "" : "s"}: ${result.notes
          .map((n) => `${n.content}${n.book ? ` (${n.book})` : ""}`)
          .join(" · ")}`;
  }
  const delNote = /^delete note:\s*(.+)$/i.exec(message);
  if (delNote) {
    const result = JSON.parse(
      await execute("delete_note", { note: delNote[1] }),
    ) as { deleted?: string; error?: string };
    return result.error ?? `Deleted the note: “${result.deleted}”.`;
  }
  if (/^what are we reading/i.test(message)) {
    // Answers from ctx.book — proving the attached book's context
    // (summary + notes) reached this turn's prompt assembly.
    if (!ctx.book) return "This chat isn't attached to a library book.";
    const notes =
      ctx.book.notes.length === 0
        ? "no notes on it yet"
        : `${ctx.book.notes.length} note${ctx.book.notes.length === 1 ? "" : "s"}: ${ctx.book.notes.join(" · ")}`;
    return `We're discussing “${ctx.book.title}”${ctx.book.author ? ` by ${ctx.book.author}` : ""} — you have ${notes}.`;
  }
  if (/^what have i read/i.test(message)) {
    // Answers from ctx.library — proving the library index is injected
    // into EVERY chat, not just book chats.
    return ctx.library.length === 0
      ? "Your library is empty."
      : `Your library: ${ctx.library.map((b) => b.title).join(", ")}.`;
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
