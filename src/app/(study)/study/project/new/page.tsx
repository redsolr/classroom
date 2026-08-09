import type { Metadata } from "next";
import { FolderPlus } from "lucide-react";
import { createStudyProject } from "@/lib/actions/study";
import { requireLearner } from "@/lib/auth";
import { ProjectFields } from "@/components/study/project-fields";
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
        <ProjectFields />
        <SubmitButton>Create project</SubmitButton>
      </form>
    </div>
  );
}
