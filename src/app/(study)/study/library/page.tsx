import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { BookOpen, Plus } from "lucide-react";
import { db, studyBooks, studyNotes } from "@/db";
import { requireLearner } from "@/lib/auth";
import { AddBookDialog } from "@/components/study/add-book-dialog";
import { BookCover } from "@/components/study/book-cover";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Library" };

/**
 * The reading library shelf — one generated cover per book/article the
 * learner reads. A cover opens the book's page: summary, notes, and its
 * discussion chats. General learning, not vocab (that shelf lives under
 * Vocabulary).
 */
export default async function LibraryPage() {
  const learner = await requireLearner();

  const books = await db
    .select({
      id: studyBooks.id,
      title: studyBooks.title,
      author: studyBooks.author,
      noteCount: sql<number>`count(${studyNotes.id})::int`,
    })
    .from(studyBooks)
    .leftJoin(studyNotes, eq(studyNotes.bookId, studyBooks.id))
    .where(eq(studyBooks.learnerId, learner.id))
    .groupBy(studyBooks.id)
    .orderBy(desc(studyBooks.createdAt));

  return (
    <div className="library-page mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.625rem] font-semibold tracking-tight">
            Library
          </h1>
          <p className="mt-0.5 text-[0.9375rem] text-fg-secondary">
            What you&apos;re reading, and what you took from it.
          </p>
        </div>
        <AddBookDialog>
          <Button variant="primary">
            <Plus className="size-3.5" />
            Add book
          </Button>
        </AddBookDialog>
      </header>

      {books.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="Your library is empty"
          description="Add a book or article you're reading — each one holds your notes and a chat to discuss it."
          action={
            <AddBookDialog>
              <Button variant="primary">
                <Plus className="size-3.5" />
                Add your first book
              </Button>
            </AddBookDialog>
          }
        />
      ) : (
        <div className="library-shelf grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/study/library/${book.id}`}
              className="library-book group block"
            >
              <BookCover
                title={book.title}
                author={book.author}
                className="transition-transform group-hover:-translate-y-1"
              />
              <span className="mt-2 block truncate text-[0.875rem] font-medium">
                {book.title}
              </span>
              <span className="block text-[0.8125rem] text-fg-tertiary">
                {book.noteCount} note{book.noteCount === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
