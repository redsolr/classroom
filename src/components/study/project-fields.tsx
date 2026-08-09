import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

/**
 * The project form body — one definition for the create page and the
 * project settings page, so the two can't drift.
 */
export function ProjectFields({
  defaults,
}: {
  defaults?: {
    name: string;
    language: string | null;
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
        label="Language"
        hint="Optional — set it and chats in this project get the language tutor with your vocabulary."
      >
        <Select name="language" defaultValue={defaults?.language ?? ""}>
          <option value="">Not language-specific</option>
          {STUDY_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </Select>
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
          placeholder="e.g. Always correct my grammar strictly. Keep replies short."
        />
      </Field>
    </>
  );
}
