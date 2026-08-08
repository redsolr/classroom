import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { BookOpenCheck, Trash2 } from "lucide-react";
import { db, studyVocab, type StudyVocabItem } from "@/db";
import { addStudyVocab, deleteStudyVocab } from "@/lib/actions/study";
import { requireLearner } from "@/lib/auth";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My vocabulary" };

const LANGUAGES = [
  "French",
  "Japanese",
  "English",
  "Spanish",
  "German",
  "Italian",
  "Korean",
  "Chinese",
  "Thai",
  "Portuguese",
];

const STATUS_STYLES: Record<StudyVocabItem["status"], string> = {
  new: "bg-surface-hover text-fg-secondary",
  learning: "bg-accent-soft text-accent-text",
  reviewing: "bg-accent-soft text-accent-text",
  mastered: "bg-accent text-white",
};

function isDue(item: StudyVocabItem, now: Date): boolean {
  return item.srsDueAt === null || item.srsDueAt <= now;
}

export default async function StudyVocabPage() {
  const learner = await requireLearner();
  const now = new Date();

  const items = await db
    .select()
    .from(studyVocab)
    .where(eq(studyVocab.learnerId, learner.id))
    .orderBy(desc(studyVocab.createdAt));

  const dueCount = items.filter((item) => isDue(item, now)).length;
  const byLanguage = new Map<string, StudyVocabItem[]>();
  for (const item of items) {
    const list = byLanguage.get(item.language) ?? [];
    list.push(item);
    byLanguage.set(item.language, list);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
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
              {LANGUAGES.map((lang) => (
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
        [...byLanguage.entries()].map(([language, list]) => (
          <section key={language} className="mb-8">
            <h2 className="mb-2.5 text-[1rem] font-semibold">{language}</h2>
            <ul className="space-y-2">
              {list.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-3 rounded-lg bg-surface px-4 py-3 shadow-card"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.9375rem]">
                      <span className="font-semibold">{item.term}</span>
                      {item.reading && (
                        <span className="ml-1.5 text-fg-secondary">
                          [{item.reading}]
                        </span>
                      )}
                      {item.meaning && (
                        <span className="text-fg-secondary">
                          {" "}
                          — {item.meaning}
                        </span>
                      )}
                    </p>
                    {item.example && (
                      <p className="mt-0.5 truncate text-[0.875rem] text-fg-tertiary italic">
                        {item.example}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[0.72rem] font-medium",
                      STATUS_STYLES[item.status],
                    )}
                  >
                    {isDue(item, now) ? "due" : item.status}
                  </span>
                  <form action={deleteStudyVocab.bind(null, item.id)}>
                    <button
                      type="submit"
                      title="Delete word"
                      className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-tertiary transition-colors hover:bg-surface-hover hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
