"use client";

import * as React from "react";
import { addStudyVocabToBook } from "@/lib/actions/study";
import { WordFormDialog } from "@/components/study/word-form-dialog";

/**
 * The pinned book's one-tap add: word straight into the book from
 * anywhere in the app (the sidebar's + button). Already-saved words are
 * adopted instead of duplicated.
 */
export function QuickAddVocabDialog({
  bookId,
  bookName,
  defaultLanguage,
  children,
}: {
  bookId: string;
  bookName: string;
  defaultLanguage?: string;
  children: React.ReactNode;
}) {
  return (
    <WordFormDialog
      title={`Add to ${bookName}`}
      description="Saved to your vocabulary and filed into this book."
      trigger={children}
      defaultLanguage={defaultLanguage}
      showExample={false}
      action={(fd) => addStudyVocabToBook(bookId, fd)}
    />
  );
}
