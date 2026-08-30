"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createStudyBook } from "@/lib/actions/books";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

/**
 * Make a book.
 *
 * Title only, with author optional. A container that demands a
 * description before it exists is a container people do not make — and
 * everything else about a book (its decks, its notes, whether you read
 * it) is added by using it, not by filling in a form first.
 */
export function NewBookDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title="New book"
        description="A place to keep decks and notes together."
      >
        <form
          action={async (formData) => {
            const { id } = await createStudyBook(formData);
            setOpen(false);
            toast.success("Book created");
            // Straight into it: a new empty container is only useful
            // once you put something in it, so land where you can.
            router.push(`/books/${id}`);
          }}
          className="space-y-4"
        >
          <Field label="Title">
            <Input name="title" required maxLength={200} autoFocus />
          </Field>
          <Field label="Author" hint="Optional — for books you're reading.">
            <Input name="author" maxLength={200} />
          </Field>
          <SubmitButton className="w-full">Create book</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
