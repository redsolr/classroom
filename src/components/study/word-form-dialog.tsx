"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { STUDY_VOCAB_CATEGORIES } from "@/lib/study-vocab-categories";

/**
 * THE word form — one dialog behind every add/edit path (vocabulary
 * "New word", pinned-book quick-add, row-menu edit), so the fields, the
 * labels, and the submit scaffolding can't drift apart. Callers differ
 * only in trigger/controlled mode, defaults, and the action the
 * FormData lands in.
 */
export function WordFormDialog({
  title,
  description,
  submitLabel = "Add word",
  trigger,
  open: controlledOpen,
  onOpenChange,
  defaults,
  defaultLanguage,
  showExample = true,
  action,
}: {
  title: string;
  description?: string;
  submitLabel?: string;
  /** Uncontrolled mode: the element that opens the dialog. */
  trigger?: React.ReactNode;
  /** Controlled mode (edit): the caller owns open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaults?: {
    language?: string;
    term?: string;
    reading?: string | null;
    meaning?: string | null;
    example?: string | null;
    category?: string | null;
  };
  defaultLanguage?: string;
  showExample?: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) setError(null);
  };
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await action(data);
        setOpen(false);
      } catch (err) {
        console.error("word form: action failed", err);
        setError("That didn't save — please try again.");
      }
    });
  };

  const language = defaults?.language ?? defaultLanguage ?? "French";
  const languageOptions = (STUDY_LANGUAGES as readonly string[]).includes(
    language,
  )
    ? [...STUDY_LANGUAGES]
    : [language, ...STUDY_LANGUAGES];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== undefined && (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent title={title} description={description}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Language">
              <Select name="language" defaultValue={language}>
                {languageOptions.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select name="category" defaultValue={defaults?.category ?? ""}>
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
            <Input
              name="term"
              required
              autoFocus
              maxLength={200}
              defaultValue={defaults?.term}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reading" hint="furigana, romaji, IPA">
              <Input
                name="reading"
                maxLength={200}
                placeholder="Optional"
                defaultValue={defaults?.reading ?? ""}
              />
            </Field>
            <Field label="Meaning">
              <Input
                name="meaning"
                maxLength={500}
                placeholder="Optional"
                defaultValue={defaults?.meaning ?? ""}
              />
            </Field>
          </div>
          {showExample && (
            <Field label="Example">
              <Input
                name="example"
                maxLength={1000}
                placeholder="Optional"
                defaultValue={defaults?.example ?? ""}
              />
            </Field>
          )}
          {error && (
            <p role="alert" className="text-[0.875rem] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={pending}>
            {submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
