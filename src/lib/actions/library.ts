"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, studyBooks, studyNotes } from "@/db";
import { requireLearner } from "@/lib/auth";

/**
 * The reading library — book/article entries and the atomic notes filed
 * under them (or loose, on /notes). The chat tools in
 * src/lib/ai/study-tools.ts write the same tables; these actions are the
 * UI's hands.
 */

/** Notes render on the book page, the Notes tab, and the shelf's note
 * counts — a note mutation must refresh all three. */
function revalidateLibrary(bookId?: string | null) {
  revalidatePath("/reading");
  revalidatePath("/notes");
  if (bookId) revalidatePath(`/reading/${bookId}`);
}

const bookSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  summary: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

function parseBookForm(formData: FormData) {
  return bookSchema.parse({
    title: formData.get("title"),
    author: formData.get("author") || undefined,
    summary: formData.get("summary") || undefined,
  });
}

/** Add-book dialog: create → the caller navigates to the new book page. */
export async function createStudyBook(
  formData: FormData,
): Promise<{ id: string }> {
  const learner = await requireLearner();
  const parsed = parseBookForm(formData);

  const [book] = await db
    .insert(studyBooks)
    .values({
      learnerId: learner.id,
      title: parsed.title,
      author: parsed.author ?? null,
      summary: parsed.summary ?? null,
    })
    .returning({ id: studyBooks.id });

  revalidateLibrary(book.id);
  return { id: book.id };
}

export async function updateStudyBook(bookId: string, formData: FormData) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(bookId);
  const parsed = parseBookForm(formData);

  const updated = await db
    .update(studyBooks)
    .set({
      title: parsed.title,
      author: parsed.author ?? null,
      summary: parsed.summary ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(studyBooks.id, id), eq(studyBooks.learnerId, learner.id)))
    .returning({ id: studyBooks.id });
  if (updated.length === 0) throw new Error("Book not found");

  revalidateLibrary(id);
}

/** Its notes survive as loose notes (FK sets book_id null → Notes tab),
 * and its chats become ordinary loose chats. */
export async function deleteStudyBook(bookId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(bookId);

  await db
    .delete(studyBooks)
    .where(and(eq(studyBooks.id, id), eq(studyBooks.learnerId, learner.id)));

  revalidateLibrary();
  redirect("/reading");
}

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

  revalidateLibrary(bookId);
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

  revalidateLibrary(updated[0].bookId);
}

export async function deleteStudyNote(noteId: string) {
  const learner = await requireLearner();
  const id = z.string().uuid().parse(noteId);

  const deleted = await db
    .delete(studyNotes)
    .where(and(eq(studyNotes.id, id), eq(studyNotes.learnerId, learner.id)))
    .returning({ bookId: studyNotes.bookId });

  if (deleted.length > 0) revalidateLibrary(deleted[0].bookId);
}
