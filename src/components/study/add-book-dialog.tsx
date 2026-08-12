"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createStudyBook } from "@/lib/actions/library";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { BookFields } from "@/components/study/book-fields";

/**
 * "Add book" is a dialog on the shelf: create → navigate straight to
 * the new book's page, where the notes live — capturing takeaways is
 * the whole point of adding a book.
 */
export function AddBookDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createStudyBook(data);
        setOpen(false);
        router.push(`/study/library/${id}`);
      } catch (err) {
        console.error("library: failed to add book", err);
        setError("Couldn't add the book — please try again.");
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
        title="Add to library"
        description="A book or article you're reading — it holds your notes, and you can discuss it with the AI."
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <BookFields />
          {error && (
            <p role="alert" className="text-[0.875rem] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={pending}>
            Add book
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
