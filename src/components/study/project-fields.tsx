import { Field, Input, Textarea } from "@/components/ui/field";

/**
 * The project form body — one definition for the create dialog and the
 * settings dialog, so the two can't drift. Projects are GENERIC
 * containers (name + standing instructions, ChatGPT-Projects shape):
 * what a project is for — a language, a book club, freelance work —
 * lives in the instructions, never in a mode field. Vocabulary language
 * is data on the WORD (VOCAB lines and tools carry it per item).
 */
export function ProjectFields({
  defaults,
}: {
  defaults?: {
    name: string;
    instructions: string | null;
  };
}) {
  return (
    <>
      <Field label="Name">
        <Input
          name="name"
          required
          maxLength={80}
          defaultValue={defaults?.name}
          placeholder={defaults ? undefined : "French · Japanese · Freelance · …"}
        />
      </Field>
      <Field
        label="Custom instructions"
        hint="Optional — the AI follows these in every chat in this project."
      >
        <Textarea
          name="instructions"
          rows={5}
          maxLength={4000}
          defaultValue={defaults?.instructions ?? ""}
          placeholder="e.g. You're my French tutor — correct my grammar strictly, keep replies short."
        />
      </Field>
    </>
  );
}
