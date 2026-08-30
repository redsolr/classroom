import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { BookOpen, LibraryBig, Plus } from "lucide-react";
import { db, studyBooks, studyNotes } from "@/db";
import { requireLearner } from "@/lib/auth";
import { AddBookDialog } from "@/components/study/add-book-dialog";
import { BookCover } from "@/components/study/book-cover";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, PageShell } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Reading list" };

/**
 * THE READING LIST — books you have READ.
 *
 * A filter over books now, not its own kind of thing (2026-08-30 merge).
 * That is the whole point of merging the two: a book you read can carry
 * the words you took out of it in a deck, beside your notes about it,
 * rather than the vocabulary living in a different table that happened
 * to share the word "book".
 *
 * So this page shows books with `readAt` set, and everything else about
 * a book — its decks, its notes, its share link — lives on the book page
 * a cover here opens.
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
    .where(
      and(
        eq(studyBooks.learnerId, learner.id),
        // The filter that makes this a reading list rather than the Books
        // shelf. A book you haven't read is still a book; it just belongs
        // on the other page.
        isNotNull(studyBooks.readAt),
      ),
    )
    .groupBy(studyBooks.id)
    .orderBy(desc(studyBooks.readAt));

  return (
    <PageShell className="library-page">
      <PageHeader
        icon={LibraryBig}
        title="Reading list"
        subtitle="Books you've marked as read. What you took from one lives on its page — your notes, and any words you turned into a deck."
        actions={
          <AddBookDialog>
            <Button variant="primary">
              <Plus className="size-3.5" />
              Add book
            </Button>
          </AddBookDialog>
        }
      />

      {books.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="Your reading list is empty"
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
        <div className="library-shelf grid max-w-4xl grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/reading/${book.id}`}
              className="library-book group block"
            >
              <BookCover
                title={book.title}
                author={book.author}
                className="transition duration-200 group-hover:brightness-110"
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
    </PageShell>
  );
}
