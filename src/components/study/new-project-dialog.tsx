"use client";

import * as React from "react";
import { createStudyProject } from "@/lib/actions/study";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ProjectFields } from "@/components/study/project-fields";

/**
 * "New project" is a dialog, not a page (ChatGPT-shaped): create → the
 * dialog closes and the folder appears in the sidebar — the learner
 * stays exactly where they were. Settings remain reachable later via
 * the folder's ⋯ → Project settings.
 */
export function NewProjectDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createStudyProject(data);
        setOpen(false);
      } catch (err) {
        console.error("study: failed to create project", err);
        setError("Couldn't create the project — please try again.");
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
        title="New project"
        description="A project groups chats and carries standing instructions the AI follows in every chat inside it."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <ProjectFields />
          {error && (
            <p role="alert" className="text-[0.875rem] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={pending}>
            Create project
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
