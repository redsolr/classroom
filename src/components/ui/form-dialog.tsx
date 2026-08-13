"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button, SubmitButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/**
 * "Add record" dialog: trigger button + modal form that closes itself
 * after the server action resolves. Shared by goals, insights,
 * corrections, vocabulary, and homework.
 */
export function FormDialog({
  triggerLabel,
  title,
  description,
  submitLabel,
  action,
  children,
}: {
  triggerLabel: string;
  title: string;
  description?: string;
  submitLabel: string;
  action: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form
          action={async (fd) => {
            await action(fd);
            setOpen(false);
          }}
          className="space-y-3"
        >
          {children}
          <div className="flex justify-end">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Client-transition flavor of the above, for dialogs whose submit needs
 * a RESULT from the action (created id → navigate) or a custom error
 * banner: the caller supplies the whole trigger and an onSubmit that may
 * throw; this owns the open/pending/error scaffolding so the study-side
 * create dialogs (project, library book) can't drift apart.
 */
export function TransitionFormDialog({
  trigger,
  title,
  description,
  submitLabel,
  errorMessage,
  onSubmit,
  children,
  footer,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  submitLabel: string;
  /** Shown when onSubmit throws (the error itself is console.error'd). */
  errorMessage: string;
  onSubmit: (formData: FormData) => Promise<void>;
  children: React.ReactNode;
  /** Rendered below the form — e.g. a settings dialog's danger zone. */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await onSubmit(data);
        setOpen(false);
      } catch (err) {
        console.error(`dialog: "${title}" submit failed`, err);
        setError(errorMessage);
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {children}
          {error && (
            <p role="alert" className="text-[0.875rem] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={pending}>
            {submitLabel}
          </Button>
        </form>
        {footer}
      </DialogContent>
    </Dialog>
  );
}
