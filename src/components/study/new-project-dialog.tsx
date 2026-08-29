"use client";

import * as React from "react";
import { createStudyProject } from "@/lib/actions/study";
import { TransitionFormDialog } from "@/components/ui/form-dialog";
import { ProjectFields } from "@/components/study/project-fields";

/**
 * "New project" is a dialog, not a page (ChatGPT-shaped): create → the
 * dialog closes and the folder appears in the sidebar — the learner
 * stays exactly where they were. Settings remain reachable later via
 * the folder's ⋯ → Project settings.
 */
export function NewProjectDialog({ children }: { children: React.ReactNode }) {
  return (
    <TransitionFormDialog
      trigger={children}
      title="New project"
      description="A project groups chats and carries standing instructions the AI follows in every chat inside it."
      submitLabel="Create project"
      errorMessage="Couldn't create the project — please try again."
      onSubmit={async (data) => {
        await createStudyProject(data);
      }}
    >
      <ProjectFields />
    </TransitionFormDialog>
  );
}
