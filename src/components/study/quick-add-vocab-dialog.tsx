"use client";

import * as React from "react";
import { addStudyVocabToBook } from "@/lib/actions/study";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { STUDY_VOCAB_CATEGORIES } from "@/lib/study-vocab-categories";

/**
 * The pinned book's one-tap add: word straight into the book from
 * anywhere in the app (the sidebar's + button). Already-saved words are
 * adopted instead of duplicated.
 */
export function QuickAddVocabDialog({
  bookId,
  bookName,
  defaultLanguage,
  children,
}: {
  bookId: string;
  bookName: string;
  defaultLanguage?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await addStudyVocabToBook(bookId, data);
        setOpen(false);
      } catch (err) {
        console.error("quick add: failed to add word to book", err);
        setError("Couldn't add the word — please try again.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title={`Add to ${bookName}`}
        description="Saved to your vocabulary and filed into this book."
      >
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language">
              <Select name="language" defaultValue={defaultLanguage ?? "French"}>
                {STUDY_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select name="category" defaultValue="">
                <option value="">No category</option>
                {STUDY_VOCAB_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Word or phrase">
            <Input name="term" required autoFocus maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reading">
              <Input name="reading" maxLength={200} placeholder="Optional" />
            </Field>
            <Field label="Meaning">
              <Input name="meaning" maxLength={500} placeholder="Optional" />
            </Field>
          </div>
          {error && (
            <p role="alert" className="text-[0.875rem] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={pending}>
            Add word
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
