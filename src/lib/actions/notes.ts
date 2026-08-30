"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, studyBooks, studyNotes } from "@/db";
import { requireLearner } from "@/lib/auth";
import { revalidateBook } from "@/lib/study-revalidate";

/**
 * NOTES — atomic "what I learned" entries, filed under a book or loose.
 *
 * This file was `library.ts` and also owned the book entity, back when
 * "library book" and "vocabulary book" were separate things. The
 * 2026-08-30 merge made them one, so the book actions moved to
 * `books.ts` — leaving this as what it always really was: the note
 * primitive. Keeping a second `createStudyBook` here would have been two
 * ways to make the same row, which is how two creation paths end up
 * disagreeing about defaults.
 *
 * The chat tools in `src/lib/ai/study-tools.ts` write the same table;
 * these actions are the UI's hands on it.
 */

/**
 * A note shows on the book page, the Notes tab and the shelf's counts,
 * which is exactly the set `revalidateBook` already owns — this file
 * kept its own third copy of that list until 2026-08-30.
 */

const noteContentSchema = z.string().trim().min(1).max(4000);

export async function createStudyNote(input: {
  content: string;
  bookId?: string;
}) {
  const learner = await requireLearner();
  const content = noteContentSchema.parse(input.content);

  let bookId: string | null = null;
  if (input.bookId) {
    const id = z.string().uuid().parse(input.bookId);
    const book = await db.query.studyBooks.findFirst({
      where: and(eq(studyBooks.id, id), eq(studyBooks.learnerId, learner.id)),
      columns: { id: true },
    });
    if (!book) throw new Error("Book not found");
    bookId = book.id;
  }

  await db.insert(studyNotes).values({
    learnerId: learner.id,
    bookId,
    content,
  });

  revalidateBook(bookId);
}

export async function updateStudyNote(noteId: string, content: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(noteId);
  const parsed = noteContentSchema.parse(content);

  const updated = await db
    .update(studyNotes)
    .set({ content: parsed, updatedAt: new Date() })
    .where(and(eq(studyNotes.id, id), eq(studyNotes.learnerId, learner.id)))
    .returning({ bookId: studyNotes.bookId });
  if (updated.length === 0) throw new Error("Note not found");

  revalidateBook(updated[0].bookId);
}

export async function deleteStudyNote(noteId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(noteId);

  const deleted = await db
    .delete(studyNotes)
    .where(and(eq(studyNotes.id, id), eq(studyNotes.learnerId, learner.id)))
    .returning({ bookId: studyNotes.bookId });

  if (deleted.length > 0) revalidateBook(deleted[0].bookId);
}
