"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import type { StudySentence } from "@/db";
import {
  addStudySentence,
  deleteStudySentence,
  generateStudySentences,
  updateStudySentence,
} from "@/lib/actions/sentences";
import { parseCloze } from "@/lib/cloze";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownSeparator,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

export type SentenceBook = { id: string; name: string };

/**
 * The sentence-card manager.
 *
 * Deliberately NOT a table like the vocabulary: a sentence is prose, and
 * a row that truncates prose to fit a column teaches you nothing at a
 * glance. Each card is a line you can read, with its blank drawn as a
 * blank, so scanning the list is itself a weak review.
 */

/** The sentence with its blank drawn as one — the reading view. */
function ClozeLine({ text }: { text: string }) {
  const parsed = parseCloze(text);
  if (!parsed) return <span>{text}</span>;
  return (
    <span>
      {parsed.before}
      <span className="sentence-blank mx-0.5 rounded bg-accent-soft px-1.5 font-semibold text-accent-text">
        {parsed.answer}
      </span>
      {parsed.after}
    </span>
  );
}

const CLOZE_HELP =
  "Wrap the word being tested in {{double braces}} — that's the blank.";

function SentenceForm({
  sentence,
  onDone,
}: {
  sentence?: StudySentence;
  onDone: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          try {
            await (sentence
              ? updateStudySentence(sentence.id, data)
              : addStudySentence(data));
            onDone();
          } catch (err) {
            console.error("sentences: failed to save the card", err);
            // The one validation a learner can actually get wrong is the
            // blank, so say that rather than "something went wrong".
            setError(CLOZE_HELP);
          }
        });
      }}
      className="space-y-3"
    >
      <Field label="Language">
        <Select name="language" defaultValue={sentence?.language ?? "Japanese"}>
          {STUDY_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Sentence" hint={CLOZE_HELP}>
        <Textarea
          name="text"
          required
          rows={2}
          maxLength={400}
          defaultValue={sentence?.text ?? ""}
          placeholder="今日は{{魔王}}を倒しに行く。"
        />
      </Field>
      <Field label="Translation">
        <Input
          name="translation"
          maxLength={400}
          defaultValue={sentence?.translation ?? ""}
          placeholder="Today we go to defeat the demon lord."
        />
      </Field>
      <Field label="Note">
        <Input
          name="note"
          maxLength={300}
          defaultValue={sentence?.note ?? ""}
          placeholder="Optional grammar or usage aside"
        />
      </Field>
      {error && (
        <p role="alert" className="text-[0.875rem] text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending}>
          {sentence ? "Save card" : "Add card"}
        </Button>
      </div>
    </form>
  );
}

function SentenceRow({ sentence }: { sentence: StudySentence }) {
  const [editing, setEditing] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  return (
    <li className="sentence-row group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-hover">
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] leading-relaxed">
          <ClozeLine text={sentence.text} />
        </p>
        {sentence.translation && (
          <p className="mt-0.5 text-[0.875rem] text-fg-secondary">
            {sentence.translation}
          </p>
        )}
        {sentence.note && (
          <p className="mt-0.5 text-[0.8125rem] text-fg-tertiary italic">
            {sentence.note}
          </p>
        )}
      </div>
      <span className="w-20 shrink-0 text-left text-[0.78rem] text-fg-tertiary">
        {sentence.language}
      </span>

      <Dropdown>
        <DropdownTrigger asChild>
          <button
            type="button"
            aria-label={`Sentence options`}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-tertiary opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg max-lg:opacity-100 data-[state=open]:text-fg data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownTrigger>
        <DropdownContent align="start" className="w-48">
          <DropdownItem disabled={pending} onSelect={() => setEditing(true)}>
            <Pencil className="size-4 text-fg-tertiary" />
            Edit
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            disabled={pending}
            className="text-danger"
            onSelect={() => {
              startTransition(async () => {
                try {
                  await deleteStudySentence(sentence.id);
                } catch (err) {
                  console.error("sentences: failed to delete the card", err);
                }
              });
            }}
          >
            <Trash2 className="size-4" />
            Delete card
          </DropdownItem>
        </DropdownContent>
      </Dropdown>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent
          title="Edit sentence card"
          description="The blank is what gets tested."
        >
          <SentenceForm
            sentence={sentence}
            onDone={() => setEditing(false)}
          />
        </DialogContent>
      </Dialog>
    </li>
  );
}

/** "Make cards" — the whole point of the feature: the learner never
 * writes a cloze sentence by hand unless they want to. */
function GenerateButton({ books }: { books: SentenceBook[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<string | null>(null);

  const generate = (listId: string | null) => {
    setResult(null);
    startTransition(async () => {
      try {
        const { created } = await generateStudySentences(listId);
        setResult(
          created === 0
            ? // True whether the learner has no words at all or every
              // word already carries a card — claiming full coverage to
              // someone with an empty vocabulary would be a small lie.
              "No new words to build from — save some words first."
            : `Made ${created} card${created === 1 ? "" : "s"}.`,
        );
        router.refresh();
      } catch (err) {
        console.error("sentences: failed to generate cards", err);
        setResult("Couldn't make cards just now — try again.");
      }
    });
  };

  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <Button variant="primary" loading={pending}>
            <Wand2 className="size-3.5" />
            Make cards
          </Button>
        </DropdownTrigger>
        <DropdownContent align="end" className="w-56">
          <p className="px-2 pt-1 pb-1.5 text-[0.72rem] font-semibold tracking-wider text-fg-tertiary uppercase">
            From words in
          </p>
          <DropdownItem onSelect={() => generate(null)}>
            <Sparkles className="size-4 text-fg-tertiary" />
            All words
          </DropdownItem>
          {books.map((book) => (
            <DropdownItem key={book.id} onSelect={() => generate(book.id)}>
              <span className="truncate">{book.name}</span>
            </DropdownItem>
          ))}
        </DropdownContent>
      </Dropdown>
      {result && (
        <span role="status" className="text-[0.875rem] text-fg-secondary">
          {result}
        </span>
      )}
    </>
  );
}

export function SentenceList({
  sentences,
  books,
}: {
  sentences: StudySentence[];
  books: SentenceBook[];
}) {
  const [adding, setAdding] = React.useState(false);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <GenerateButton books={books} />
        <Dialog open={adding} onOpenChange={setAdding}>
          <DialogTrigger asChild>
            <Button>New sentence</Button>
          </DialogTrigger>
          <DialogContent
            title="New sentence card"
            description="Write the sentence and mark the word being tested."
          >
            <SentenceForm onDone={() => setAdding(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {sentences.length === 0 ? (
        <div className="rounded-xl bg-surface px-5 py-8 text-center shadow-card">
          <p className="text-[0.9375rem] font-medium">No sentence cards yet</p>
          <p className="mx-auto mt-1 max-w-md text-[0.875rem] text-fg-tertiary">
            “Make cards” writes them from words you already saved — one
            sentence per word, with the word blanked out. Knowing what a
            word means and being able to supply it are different skills.
          </p>
        </div>
      ) : (
        <ul className="sentence-shelf divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card">
          {sentences.map((sentence) => (
            <SentenceRow key={sentence.id} sentence={sentence} />
          ))}
        </ul>
      )}
    </div>
  );
}
