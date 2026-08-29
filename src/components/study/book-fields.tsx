import { Field, Input, Textarea } from "@/components/ui/field";

/**
 * The library-book form body — one definition for the add-book dialog
 * and the book-page settings form, so the two can't drift.
 */
export function BookFields({
  defaults,
}: {
  defaults?: {
    title: string;
    author: string | null;
    summary: string | null;
  };
}) {
  return (
    <>
      <Field label="Title">
        <Input
          name="title"
          required
          maxLength={200}
          defaultValue={defaults?.title}
          placeholder={defaults ? undefined : "Book or article title"}
        />
      </Field>
      <Field label="Author" hint="Optional — author or publication (e.g. HBR).">
        <Input
          name="author"
          maxLength={120}
          defaultValue={defaults?.author ?? ""}
        />
      </Field>
      <Field
        label="Summary"
        hint="Optional — what is it about? The AI reads this when you discuss the book or ask what you've read."
      >
        <Textarea
          name="summary"
          rows={4}
          maxLength={2000}
          defaultValue={defaults?.summary ?? ""}
          placeholder="One short paragraph."
        />
      </Field>
    </>
  );
}
