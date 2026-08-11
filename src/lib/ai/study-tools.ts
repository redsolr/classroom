import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  studyMemories,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { STUDY_VOCAB_CATEGORIES } from "@/lib/study-vocab-categories";

/**
 * The tutor's hands on the learner's vocabulary: function tools the
 * study chat exposes to the model so "add 猫 to my vocab" / "make a
 * list of the verbs we practiced" actually mutate the learner's data.
 *
 * Every executor is scoped to ONE learner (constructed per request from
 * the authed session — the model can never name a learner), and every
 * result is a compact JSON string the model narrates from. Failures
 * return {"error": …} instead of throwing: a bad tool call should
 * produce an apologetic sentence, not a broken stream.
 */

export type StudyToolExecutor = (
  name: string,
  args: unknown,
) => Promise<string>;

/** OpenAI Responses function-tool definitions. */
export const STUDY_TOOL_DEFS = [
  {
    type: "function" as const,
    name: "add_vocab",
    description:
      "Save a word or phrase to the learner's personal vocabulary. Use when the learner asks to save/add/remember a word.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        term: { type: "string", description: "The word or phrase itself" },
        meaning: { type: "string", description: "Short gloss in the learner's language" },
        reading: { type: "string", description: "Pronunciation aid (furigana/romaji/IPA)" },
        example: { type: "string", description: "One example sentence" },
        category: {
          type: "string",
          enum: [...STUDY_VOCAB_CATEGORIES],
          description: "Word class",
        },
        language: {
          type: "string",
          enum: [...STUDY_LANGUAGES],
          description: "Only needed in chats not tied to a language",
        },
      },
      required: ["term"],
    },
  },
  {
    type: "function" as const,
    name: "update_vocab",
    description:
      "Update an existing saved word (matched by its term). Only the provided fields change.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        term: { type: "string", description: "The saved term to update" },
        meaning: { type: "string" },
        reading: { type: "string" },
        example: { type: "string" },
        category: { type: "string", enum: [...STUDY_VOCAB_CATEGORIES] },
        new_term: { type: "string", description: "Corrected spelling of the term itself" },
        language: { type: "string", enum: [...STUDY_LANGUAGES] },
      },
      required: ["term"],
    },
  },
  {
    type: "function" as const,
    name: "delete_vocab",
    description: "Remove a word from the learner's vocabulary (matched by its term).",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        term: { type: "string" },
        language: { type: "string", enum: [...STUDY_LANGUAGES] },
      },
      required: ["term"],
    },
  },
  {
    type: "function" as const,
    name: "list_vocab",
    description:
      "Read the learner's saved vocabulary (optionally filtered by category). Use before updating/deleting when unsure of exact terms.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...STUDY_VOCAB_CATEGORIES] },
        language: { type: "string", enum: [...STUDY_LANGUAGES] },
        limit: { type: "number", description: "Max words to return (default 50)" },
      },
      required: [],
    },
  },
  {
    type: "function" as const,
    name: "create_vocab_list",
    description:
      "Create a named, ordered vocabulary list from already-saved terms (e.g. 'Common verbs').",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        terms: {
          type: "array",
          items: { type: "string" },
          description: "Saved terms, in the order the list should have",
        },
        language: { type: "string", enum: [...STUDY_LANGUAGES] },
      },
      required: ["name", "terms"],
    },
  },
  {
    type: "function" as const,
    name: "add_to_vocab_list",
    description: "Add an already-saved term to one of the learner's lists (by list name).",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        list: { type: "string", description: "List name" },
        term: { type: "string" },
        language: { type: "string", enum: [...STUDY_LANGUAGES] },
      },
      required: ["list", "term"],
    },
  },
  {
    type: "function" as const,
    name: "remove_from_vocab_list",
    description: "Remove a term from one of the learner's lists (the word itself stays saved).",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        list: { type: "string", description: "List name" },
        term: { type: "string" },
      },
      required: ["list", "term"],
    },
  },
  {
    type: "function" as const,
    name: "remember",
    description:
      "Save a durable fact about the learner to long-term memory (goals, exam dates, level, interests, learning preferences). Use when the learner shares something worth knowing next session, or explicitly asks you to remember. Never save secrets or sensitive personal data.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        fact: {
          type: "string",
          description:
            "One short third-person sentence, e.g. 'Is preparing for the JLPT N3 exam in December.'",
        },
      },
      required: ["fact"],
    },
  },
  {
    type: "function" as const,
    name: "forget_memory",
    description:
      "Delete a saved memory about the learner (matched by its wording). Use when the learner asks you to forget something or a saved fact is no longer true.",
    strict: false,
    parameters: {
      type: "object",
      properties: {
        fact: {
          type: "string",
          description: "The saved memory to delete, or a distinctive part of it",
        },
      },
      required: ["fact"],
    },
  },
];

const addArgs = z.object({
  term: z.string().trim().min(1).max(200),
  meaning: z.string().trim().max(500).optional(),
  reading: z.string().trim().max(200).optional(),
  example: z.string().trim().max(1000).optional(),
  category: z.enum(STUDY_VOCAB_CATEGORIES).optional(),
  language: z.string().trim().max(40).optional(),
});
const updateArgs = addArgs.extend({
  new_term: z.string().trim().min(1).max(200).optional(),
});
const deleteArgs = z.object({
  term: z.string().trim().min(1).max(200),
  language: z.string().trim().max(40).optional(),
});
const listArgs = z.object({
  category: z.enum(STUDY_VOCAB_CATEGORIES).optional(),
  language: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
const createListArgs = z.object({
  name: z.string().trim().min(1).max(80),
  terms: z.array(z.string().trim().min(1)).min(1).max(200),
  language: z.string().trim().max(40).optional(),
});
const listMemberArgs = z.object({
  list: z.string().trim().min(1).max(80),
  term: z.string().trim().min(1).max(200),
  language: z.string().trim().max(40).optional(),
});
const memoryArgs = z.object({
  fact: z.string().trim().min(1).max(500),
});

/** Total memories per learner — bounds the injected prompt block. */
const MEMORY_CAP = 200;

function ok(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}
function fail(message: string): string {
  return JSON.stringify({ error: message });
}

export function createStudyToolExecutor(scope: {
  learnerId: string;
  /** The chat's language — the default filing target. */
  language: string | null;
}): StudyToolExecutor {
  const { learnerId } = scope;

  const resolveLanguage = (requested?: string): string | null =>
    requested?.trim() || scope.language;

  const findWord = async (term: string, language: string | null) => {
    return db.query.studyVocab.findFirst({
      where: and(
        eq(studyVocab.learnerId, learnerId),
        ilike(studyVocab.term, term),
        ...(language ? [eq(studyVocab.language, language)] : []),
      ),
    });
  };

  const findList = async (name: string) => {
    return db.query.studyVocabLists.findFirst({
      where: and(
        eq(studyVocabLists.learnerId, learnerId),
        ilike(studyVocabLists.name, name),
      ),
    });
  };

  return async (name, rawArgs) => {
    try {
      switch (name) {
        case "add_vocab": {
          const args = addArgs.parse(rawArgs);
          const language = resolveLanguage(args.language);
          if (!language) {
            return fail(
              "No language to file this under — ask the learner which language, then call add_vocab with it.",
            );
          }
          const existing = await findWord(args.term, language);
          if (existing) {
            return ok({ saved: false, reason: "already_saved", term: existing.term });
          }
          await db.insert(studyVocab).values({
            learnerId,
            language,
            term: args.term,
            meaning: args.meaning || null,
            reading: args.reading || null,
            example: args.example || null,
            category: args.category ?? null,
          });
          return ok({ saved: true, term: args.term, language });
        }
        case "update_vocab": {
          const args = updateArgs.parse(rawArgs);
          const word = await findWord(args.term, resolveLanguage(args.language));
          if (!word) return fail(`No saved word matches “${args.term}”.`);
          await db
            .update(studyVocab)
            .set({
              term: args.new_term ?? word.term,
              meaning: args.meaning ?? word.meaning,
              reading: args.reading ?? word.reading,
              example: args.example ?? word.example,
              category: args.category ?? word.category,
              updatedAt: new Date(),
            })
            .where(eq(studyVocab.id, word.id));
          return ok({ updated: true, term: args.new_term ?? word.term });
        }
        case "delete_vocab": {
          const args = deleteArgs.parse(rawArgs);
          const word = await findWord(args.term, resolveLanguage(args.language));
          if (!word) return fail(`No saved word matches “${args.term}”.`);
          await db.delete(studyVocab).where(eq(studyVocab.id, word.id));
          return ok({ deleted: true, term: word.term });
        }
        case "list_vocab": {
          const args = listArgs.parse(rawArgs);
          const language = resolveLanguage(args.language);
          const rows = await db
            .select({
              term: studyVocab.term,
              meaning: studyVocab.meaning,
              category: studyVocab.category,
              status: studyVocab.status,
            })
            .from(studyVocab)
            .where(
              and(
                eq(studyVocab.learnerId, learnerId),
                ...(language ? [eq(studyVocab.language, language)] : []),
                ...(args.category ? [eq(studyVocab.category, args.category)] : []),
              ),
            )
            .orderBy(asc(studyVocab.term))
            .limit(args.limit ?? 50);
          return ok({ count: rows.length, words: rows });
        }
        case "create_vocab_list": {
          const args = createListArgs.parse(rawArgs);
          const language = resolveLanguage(args.language);
          const resolved = [];
          for (const term of args.terms) {
            const word = await findWord(term, language);
            if (word) resolved.push(word);
          }
          if (resolved.length === 0) {
            return fail(
              "None of those terms are in the learner's saved vocabulary — save them first with add_vocab.",
            );
          }
          const [list] = await db
            .insert(studyVocabLists)
            .values({ learnerId, name: args.name })
            .returning({ id: studyVocabLists.id });
          await db.insert(studyVocabListItems).values(
            resolved.map((word, position) => ({
              listId: list.id,
              vocabId: word.id,
              position,
            })),
          );
          return ok({
            created: true,
            list: args.name,
            added: resolved.length,
            skipped: args.terms.length - resolved.length,
          });
        }
        case "add_to_vocab_list": {
          const args = listMemberArgs.parse(rawArgs);
          const list = await findList(args.list);
          if (!list) return fail(`No list named “${args.list}”.`);
          const word = await findWord(args.term, resolveLanguage(args.language));
          if (!word) return fail(`No saved word matches “${args.term}”.`);
          const [{ max }] = await db
            .select({
              max: sql<number>`coalesce(max(${studyVocabListItems.position}), -1)`,
            })
            .from(studyVocabListItems)
            .where(eq(studyVocabListItems.listId, list.id));
          await db
            .insert(studyVocabListItems)
            .values({ listId: list.id, vocabId: word.id, position: Number(max) + 1 })
            .onConflictDoNothing();
          return ok({ added: true, list: list.name, term: word.term });
        }
        case "remember": {
          const args = memoryArgs.parse(rawArgs);
          const existing = await db.query.studyMemories.findFirst({
            where: and(
              eq(studyMemories.learnerId, learnerId),
              ilike(studyMemories.content, args.fact),
            ),
          });
          if (existing) {
            return ok({ saved: false, reason: "already_saved" });
          }
          const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(studyMemories)
            .where(eq(studyMemories.learnerId, learnerId));
          if (Number(count) >= MEMORY_CAP) {
            return fail(
              "Memory is full — ask the learner to prune old memories on the Plan & usage page first.",
            );
          }
          await db
            .insert(studyMemories)
            .values({ learnerId, content: args.fact });
          return ok({ saved: true });
        }
        case "forget_memory": {
          const args = memoryArgs.parse(rawArgs);
          const matches = await db
            .select({ id: studyMemories.id, content: studyMemories.content })
            .from(studyMemories)
            .where(
              and(
                eq(studyMemories.learnerId, learnerId),
                ilike(studyMemories.content, `%${args.fact}%`),
              ),
            )
            .limit(5);
          if (matches.length === 0) {
            return fail("No saved memory matches that.");
          }
          if (matches.length > 1) {
            return fail(
              `Several memories match — ask which one to forget: ${matches
                .map((m) => `“${m.content}”`)
                .join("; ")}`,
            );
          }
          await db
            .delete(studyMemories)
            .where(eq(studyMemories.id, matches[0].id));
          return ok({ forgotten: matches[0].content });
        }
        case "remove_from_vocab_list": {
          const args = listMemberArgs.parse(rawArgs);
          const list = await findList(args.list);
          if (!list) return fail(`No list named “${args.list}”.`);
          const word = await findWord(args.term, null);
          if (!word) return fail(`No saved word matches “${args.term}”.`);
          await db
            .delete(studyVocabListItems)
            .where(
              and(
                eq(studyVocabListItems.listId, list.id),
                eq(studyVocabListItems.vocabId, word.id),
              ),
            );
          return ok({ removed: true, list: list.name, term: word.term });
        }
        default:
          return fail(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`study tools: ${name} failed`, error);
      return fail("The operation failed — tell the learner and suggest trying again.");
    }
  };
}
