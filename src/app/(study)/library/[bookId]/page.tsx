import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { format } from "date-fns";
import { MessageCircle } from "lucide-react";
import { db, studyBooks, studyNotes, studyThreads } from "@/db";
import { deleteStudyBook, updateStudyBook } from "@/lib/actions/library";
import { createStudyThread } from "@/lib/actions/study";
import { requireLearner } from "@/lib/auth";
import { BookCover } from "@/components/study/book-cover";
import { BookFields } from "@/components/study/book-fields";
import { NoteComposer, NoteList } from "@/components/study/note-cards";
import { SubmitButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Book" };

/**
 * One library book: the learner's notes on it (the main content), its
 * discussion chats (the summary + notes ride into their context), and
 * the book's details. The chat tools write the same notes — "save
 * note: …" in a discussion lands here.
 */
export default async function LibraryBookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const learner = await requireLearner();
  const { bookId } = await params;

  const book = await db.query.studyBooks.findFirst({
    where: and(
      eq(studyBooks.id, bookId),
      eq(studyBooks.learnerId, learner.id),
    ),
  });
  if (!book) notFound();

  const [notes, threads] = await Promise.all([
    db
      .select({
        id: studyNotes.id,
        content: studyNotes.content,
        createdAt: studyNotes.createdAt,
      })
      .from(studyNotes)
      .where(
        and(
          eq(studyNotes.learnerId, learner.id),
          eq(studyNotes.bookId, book.id),
        ),
      )
      .orderBy(desc(studyNotes.createdAt)),
    db
      .select({ id: studyThreads.id, title: studyThreads.title })
      .from(studyThreads)
      .where(
        and(
          eq(studyThreads.learnerId, learner.id),
          eq(studyThreads.bookId, book.id),
        ),
      )
      .orderBy(desc(studyThreads.updatedAt)),
  ]);

  return (
    <div className="book-page mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <header className="mb-7 flex gap-4 sm:gap-5">
        <BookCover
          title={book.title}
          author={book.author}
          className="w-24 shrink-0 sm:w-28"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.5rem] font-semibold leading-tight tracking-tight">
            {book.title}
          </h1>
          {book.author && (
            <p className="mt-0.5 text-[0.9375rem] text-fg-secondary">
              {book.author}
            </p>
          )}
          {book.summary && (
            <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-fg-secondary">
              {book.summary}
            </p>
          )}
          <form action={createStudyThread} className="mt-3.5">
            <input type="hidden" name="bookId" value={book.id} />
            <SubmitButton>
              <MessageCircle className="size-3.5" />
              Discuss this book
            </SubmitButton>
          </form>
        </div>
      </header>

      <section className="book-notes mb-7">
        <h2 className="mb-2.5 text-[1rem] font-semibold">Notes</h2>
        <div className="space-y-3">
          <NoteComposer
            bookId={book.id}
            placeholder="What did you take from it? One idea per note."
          />
          {notes.length === 0 ? (
            <p className="text-[0.875rem] text-fg-tertiary">
              No notes yet — add takeaways here, or say “save note: …” in a
              discussion.
            </p>
          ) : (
            <NoteList
              notes={notes.map((note) => ({
                id: note.id,
                content: note.content,
                dateLabel: format(note.createdAt, "MMM d, yyyy"),
                book: null,
              }))}
            />
          )}
        </div>
      </section>

      {threads.length > 0 && (
        <section className="book-chats mb-7">
          <h2 className="mb-2.5 text-[1rem] font-semibold">Discussions</h2>
          <ul className="space-y-1.5">
            {threads.map((thread) => (
              <li key={thread.id}>
                <Link
                  href={`/chat?t=${thread.id}`}
                  className="block truncate rounded-lg bg-surface px-4 py-2.5 text-[0.9375rem] shadow-card transition-colors hover:bg-surface-hover"
                >
                  {thread.title ?? "New chat"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="book-settings mb-6 rounded-lg bg-surface p-4 shadow-card sm:p-5">
        <h2 className="mb-3 text-[0.9375rem] font-semibold">Book details</h2>
        <form action={updateStudyBook.bind(null, book.id)} className="space-y-4">
          <BookFields defaults={book} />
          <SubmitButton>Save book</SubmitButton>
        </form>
      </section>

      <form
        action={deleteStudyBook.bind(null, book.id)}
        className="border-t border-border pt-4"
      >
        <button
          type="submit"
          className="text-[0.875rem] text-danger hover:underline"
        >
          Delete book
        </button>
        <span className="ml-2 text-[0.8125rem] text-fg-tertiary">
          Its notes survive and move to Notes.
        </span>
      </form>
    </div>
  );
}
