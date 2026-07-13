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
