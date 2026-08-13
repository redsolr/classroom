"use client";

import * as React from "react";
import { deleteStudyProject, updateStudyProject } from "@/lib/actions/study";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { TransitionFormDialog } from "@/components/ui/form-dialog";
import { ProjectFields } from "@/components/study/project-fields";

/**
 * Project settings live behind this dialog — the project PAGE leads
 * with its chats (the settings card used to sit first and pushed the
 * chat list below the fold on phones).
 */
export function EditProjectDialog({
  project,
  children,
}: {
  project: {
    id: string;
    name: string;
    language: string | null;
    instructions: string | null;
  };
  children: React.ReactNode;
}) {
  return (
    <TransitionFormDialog
      trigger={children}
      title="Project settings"
      description="The AI follows these in every chat in this project."
      submitLabel="Save project"
      errorMessage="Couldn't save the project — please try again."
      onSubmit={async (data) => {
        await updateStudyProject(project.id, data);
      }}
      footer={
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <span className="text-[0.8125rem] text-fg-tertiary">
            Its chats survive and move to &ldquo;Chats&rdquo;.
          </span>
          <ConfirmButton
            title="Delete project"
            label="Delete project"
            // The action redirects on success (NEXT_REDIRECT is handled
            // by Next); ConfirmButton logs anything real.
            action={() => deleteStudyProject(project.id)}
          />
        </div>
      }
    >
      <ProjectFields defaults={project} />
    </TransitionFormDialog>
  );
}
