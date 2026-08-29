"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  studySentences,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { requireLearner } from "@/lib/auth";
import { hasSingleCloze } from "@/lib/cloze";
import { srsReviewPatch } from "@/lib/srs";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import {
  generateSentenceCards,
  type SentenceSeed,
} from "@/lib/ai/sentence-cards";

/**
 * SENTENCE CARDS — the second card type.
 *
 * Its own action file rather than more weight on study.ts: sentences
 * share the scheduler (src/lib/srs.ts) with words and nothing else.
 *
 * Every export here is a server action, i.e. a public POST endpoint —
 * each one resolves the caller itself (requireLearner) and scopes every
 * query to that learner's own rows. `npm run check:actions` enforces the
 * first half; the second half is on review.
 */

const languageSchema = z.enum(STUDY_LANGUAGES);
const gradeSchema = z.enum(["again", "hard", "good", "easy"]);

/** A sentence with no blank is not a card — refuse it at the edge
 * rather than storing a row the drill can't render. */
const clozeTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(400)
  .refine(hasSingleCloze, {
    message:
      "Wrap exactly one word or phrase in {{double braces}} — that's the blank.",
  });

/** The learner owns this book, or the call fails. */
async function requireOwnList(learnerId: string, listId: string) {
  const id = z.string().uuid().parse(listId);
  const list = await db.query.studyVocabLists.findFirst({
    where: and(
      eq(studyVocabLists.id, id),
      eq(studyVocabLists.learnerId, learnerId),
    ),
  });
  if (!list) throw new Error("Book not found");
  return list;
}

const sentenceFormSchema = z.object({
  language: languageSchema,
  text: clozeTextSchema,
  translation: z.string().trim().max(400).optional(),
  note: z.string().trim().max(300).optional(),
});

export async function addStudySentence(formData: FormData) {
  const learner = await requireLearner();
  const parsed = sentenceFormSchema.parse({
    language: formData.get("language"),
    text: formData.get("text"),
    translation: formData.get("translation") || undefined,
    note: formData.get("note") || undefined,
  });

  await db.insert(studySentences).values({
    learnerId: learner.id,
    language: parsed.language,
    text: parsed.text,
    translation: parsed.translation ?? null,
    note: parsed.note ?? null,
  });

  revalidatePath("/sentences");
  revalidatePath("/vocab/review");
}

export async function updateStudySentence(
  sentenceId: string,
  formData: FormData,
) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(sentenceId);
  const parsed = sentenceFormSchema.parse({
    language: formData.get("language"),
    text: formData.get("text"),
    translation: formData.get("translation") || undefined,
    note: formData.get("note") || undefined,
  });

  await db
    .update(studySentences)
    .set({
      language: parsed.language,
      text: parsed.text,
      translation: parsed.translation ?? null,
      note: parsed.note ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studySentences.id, id),
        eq(studySentences.learnerId, learner.id),
      ),
    );

  revalidatePath("/sentences");
}

export async function deleteStudySentence(sentenceId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(sentenceId);

  await db
    .delete(studySentences)
    .where(
      and(
        eq(studySentences.id, id),
        eq(studySentences.learnerId, learner.id),
      ),
    );

  revalidatePath("/sentences");
}

/**
 * One graded sentence review — the SAME SM-2-lite engine and
 * evidence-derived status pipeline as words (src/lib/srs.ts). Sentences
 * get their own schedule, not a shared one: knowing a word and
 * supplying it inside a sentence decay at different rates, and averaging
 * them would hide both.
 */
export async function reviewStudySentence(
  sentenceId: string,
  grade: "again" | "hard" | "good" | "easy",
) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(sentenceId);
  const parsedGrade = gradeSchema.parse(grade);

  const card = await db.query.studySentences.findFirst({
    where: and(
      eq(studySentences.id, id),
      eq(studySentences.learnerId, learner.id),
    ),
  });
  if (!card) throw new Error("Sentence card not found");

  const now = new Date();
  const patch = srsReviewPatch(
    {
      reps: card.srsReps,
      easeFactor: card.srsEaseFactor,
      intervalDays: card.srsIntervalDays,
    },
    parsedGrade,
    now,
  );

  await db
    .update(studySentences)
    .set({ ...patch, updatedAt: now })
    .where(
      and(
        eq(studySentences.id, id),
        eq(studySentences.learnerId, learner.id),
      ),
    );

  // Same reason the word drill doesn't revalidate itself: the page hands
  // the client a session snapshot, and refreshing mid-session yanks
  // cards out from under the learner.
  revalidatePath("/sentences");
}

/** Cram round over the same scope the session was drilling — a practice
 * deck must never silently widen past the book it was opened on. */
export async function loadStudySentencePracticeDeck(listId?: string | null) {
  const learner = await requireLearner();
  const columns = {
    id: studySentences.id,
    language: studySentences.language,
    text: studySentences.text,
    translation: studySentences.translation,
    note: studySentences.note,
  };

  if (listId) {
    const list = await requireOwnList(learner.id, listId);
    return db
      .select(columns)
      .from(studySentences)
      .where(
        and(
          eq(studySentences.learnerId, learner.id),
          eq(studySentences.listId, list.id),
        ),
      )
      .orderBy(sql`random()`)
      .limit(50);
  }

  return db
    .select(columns)
    .from(studySentences)
    .where(eq(studySentences.learnerId, learner.id))
    .orderBy(sql`random()`)
    .limit(50);
}

/** How many cards one "Make sentences" press produces. Small on purpose:
 * a wall of generated cards is a chore, not a study session. */
const GENERATE_BATCH = 8;

/**
 * Build sentence cards from words the learner already owns.
 *
 * Seeds are the words with no sentence card yet, oldest-first, scoped to
 * a book when one is given. Words that already have a card are skipped
 * so pressing the button twice extends coverage instead of duplicating
 * it — the same idea as the pack import's dedup.
 */
export async function generateStudySentences(
  listId?: string | null,
): Promise<{ created: number; skipped: number }> {
  const learner = await requireLearner();
  const list = listId ? await requireOwnList(learner.id, listId) : null;

  // LEFT JOIN + IS NULL rather than a NOT IN subquery: it stays one
  // index-friendly scan as the deck grows.
  const seedRows = await db
    .select({
      id: studyVocab.id,
      language: studyVocab.language,
      term: studyVocab.term,
      reading: studyVocab.reading,
      meaning: studyVocab.meaning,
    })
    .from(studyVocab)
    .leftJoin(studySentences, eq(studySentences.vocabId, studyVocab.id))
    .where(
      and(
        eq(studyVocab.learnerId, learner.id),
        isNull(studySentences.id),
        list
          ? sql`exists (select 1 from ${studyVocabListItems} where ${studyVocabListItems.vocabId} = ${studyVocab.id} and ${studyVocabListItems.listId} = ${list.id})`
          : undefined,
      ),
    )
    .orderBy(desc(studyVocab.createdAt))
    .limit(GENERATE_BATCH);

  if (seedRows.length === 0) return { created: 0, skipped: 0 };

  // One request per language: a sentence prompt is language-specific,
  // and a mixed batch produces worse sentences in every language in it.
  const byLanguage = new Map<string, typeof seedRows>();
  for (const row of seedRows) {
    byLanguage.set(row.language, [
      ...(byLanguage.get(row.language) ?? []),
      row,
    ]);
  }

  let created = 0;
  for (const [language, rows] of byLanguage) {
    const seeds: SentenceSeed[] = rows.map((r) => ({
      term: r.term,
      reading: r.reading,
      meaning: r.meaning,
    }));
    const cards = await generateSentenceCards(language, seeds);
    if (cards.length === 0) continue;

    // Match each card back to the word it was built from so the row
    // carries its origin — the model echoes the term, possibly inflected,
    // so fall back to a containment check before giving up the link.
    const values = cards.map((card) => {
      const seed =
        rows.find((r) => r.term === card.term) ??
        rows.find((r) => card.text.includes(r.term));
      return {
        learnerId: learner.id,
        language,
        text: card.text,
        translation: card.translation,
        note: card.note,
        vocabId: seed?.id ?? null,
        listId: list?.id ?? null,
      };
    });
    await db.insert(studySentences).values(values);
    created += values.length;
  }

  revalidatePath("/sentences");
  revalidatePath("/vocab/review");
  return { created, skipped: seedRows.length - created };
}
