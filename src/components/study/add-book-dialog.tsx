"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createStudyBook } from "@/lib/actions/books";
import { TransitionFormDialog } from "@/components/ui/form-dialog";
import { BookFields } from "@/components/study/book-fields";

/**
 * "Add book" is a dialog on the shelf: create → navigate straight to
 * the new book's page, where the notes live — capturing takeaways is
 * the whole point of adding a book.
 */
export function AddBookDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <TransitionFormDialog
      trigger={children}
      title="Add to library"
      description="A book or article you have read — it holds your notes, and you can discuss it with the AI."
      submitLabel="Add book"
      errorMessage="Couldn't add the book — please try again."
      onSubmit={async (data) => {
        // The reading list is a FILTER on `readAt` now, so a book added
        // from it has to arrive marked read — otherwise it lands on the
        // Books shelf and looks, to the person who just added it, lost.
        data.set("read", "1");
        const { id } = await createStudyBook(data);
        router.push(`/reading/${id}`);
      }}
    >
      <BookFields />
    </TransitionFormDialog>
  );
}
