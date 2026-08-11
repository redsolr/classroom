import type { Metadata } from "next";
import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { BookOpenCheck } from "lucide-react";
import {
  db,
  studyVocab,
  studyVocabListItems,
  studyVocabLists,
} from "@/db";
import { addStudyVocab } from "@/lib/actions/study";
import { requireLearner } from "@/lib/auth";
import { isCardDue } from "@/lib/srs";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { STUDY_VOCAB_CATEGORIES } from "@/lib/study-vocab-categories";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import {
  VocabTable,
  type VocabListSummary,
} from "@/components/study/vocab-table";

export const metadata: Metadata = { title: "My vocabulary" };

export default async function StudyVocabPage() {
  const learner = await requireLearner();
  const now = new Date();

  const [items, listRows, listItemRows] = await Promise.all([
    db
      .select()
      .from(studyVocab)
      .where(eq(studyVocab.learnerId, learner.id))
      .orderBy(desc(studyVocab.createdAt)),
    db
      .select({ id: studyVocabLists.id, name: studyVocabLists.name })
      .from(studyVocabLists)
      .where(eq(studyVocabLists.learnerId, learner.id))
      .orderBy(asc(studyVocabLists.createdAt)),
    db
      .select({
        listId: studyVocabListItems.listId,
        vocabId: studyVocabListItems.vocabId,
      })
      .from(studyVocabListItems)
      .innerJoin(
        studyVocabLists,
        eq(studyVocabListItems.listId, studyVocabLists.id),
      )
      .where(eq(studyVocabLists.learnerId, learner.id))
      .orderBy(
        asc(studyVocabListItems.listId),
        asc(studyVocabListItems.position),
      ),
  ]);

  const lists: VocabListSummary[] = listRows.map((list) => ({
    ...list,
    itemIds: listItemRows
      .filter((row) => row.listId === list.id)
      .map((row) => row.vocabId),
  }));

  const dueCount = items.filter((item) => isCardDue(item.srsDueAt, now)).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.625rem] font-semibold tracking-tight">
            My vocabulary
          </h1>
          <p className="mt-1 text-[0.9375rem] text-fg-secondary">
            {items.length === 0
              ? "Your personal word list — add words here or save them straight from chat."
              : `${items.length} word${items.length === 1 ? "" : "s"} · ${dueCount} due for review`}
          </p>
        </div>
        {dueCount > 0 && (
          <Link
            href="/study/vocab/review"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3.5 text-[0.9375rem] font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
          >
            <BookOpenCheck className="size-4" />
            Review {dueCount} due
          </Link>
        )}
      </header>

      <section className="mb-8 rounded-lg bg-surface p-4 shadow-card sm:p-5">
        <h2 className="mb-3 text-[0.9375rem] font-semibold">Add a word</h2>
        <form action={addStudyVocab} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Language">
            <Select name="language" defaultValue="French">
              {STUDY_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Word or phrase">
            <Input name="term" required maxLength={200} placeholder="bouquin" />
          </Field>
          <Field label="Reading" hint="furigana, romaji, IPA — optional">
            <Input name="reading" maxLength={200} />
          </Field>
          <Field label="Meaning">
            <Input name="meaning" maxLength={500} placeholder="book (informal)" />
          </Field>
          <Field label="Category" hint="verb, noun, phrase — optional">
            <Select name="category" defaultValue="">
              <option value="">No category</option>
              {STUDY_VOCAB_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Example" className="sm:col-span-2">
            <Input
              name="example"
              maxLength={1000}
              placeholder="J'ai lu un bon bouquin ce week-end."
            />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton>Add word</SubmitButton>
          </div>
        </form>
      </section>

      {items.length === 0 ? (
        <p className="text-[0.9375rem] text-fg-tertiary">
          Nothing saved yet. In chat, your tutor suggests words as little
          “+ word — meaning” chips — one tap adds them here.
        </p>
      ) : (
        <VocabTable items={items} lists={lists} />
      )}
    </div>
  );
}
