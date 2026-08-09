import type { Metadata } from "next";
import { FolderPlus } from "lucide-react";
import { createStudyProject } from "@/lib/actions/study";
import { requireLearner } from "@/lib/auth";
import { STUDY_LANGUAGES } from "@/lib/study-languages";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "New project" };

export default async function NewStudyProjectPage() {
  await requireLearner();

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
      <h1 className="flex items-center gap-2.5 text-[1.625rem] font-semibold tracking-tight">
        <FolderPlus className="size-6 text-accent" />
        New project
      </h1>
      <p className="mt-1 mb-6 text-[0.9375rem] text-fg-secondary">
        A project groups chats and carries standing instructions the AI
        follows in every chat inside it. Pick a language for a tutor
        project, or leave it off for anything else.
      </p>

      <form action={createStudyProject} className="space-y-4">
        <Field label="Name">
          <Input
            name="name"
            required
            maxLength={80}
            placeholder="French · Japanese · Freelance · …"
          />
        </Field>
        <Field
          label="Language"
          hint="Optional — set it and chats in this project get the language tutor with your vocabulary."
        >
          <Select name="language" defaultValue="">
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
            placeholder={
              "e.g. Always correct my grammar strictly. Explain in simple English. Focus on JLPT N4."
            }
          />
        </Field>
        <SubmitButton>Create project</SubmitButton>
      </form>
    </div>
  );
}
